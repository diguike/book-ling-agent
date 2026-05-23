// Claude 流式实现
// Claude 的 SSE 事件类型和 OpenAI 不同，需要单独解析
//
// Claude 事件序列：
//   message_start → content_block_start → content_block_delta(+) → content_block_stop
//   → content_block_start(tool_use) → content_block_delta(input_json_delta)(+) → content_block_stop
//   → message_delta → message_stop

import type {
  LLMProvider, LLMResponse, Message, ToolDefinition, ToolCallMessage,
} from "./types.js";
import type { StreamChunk } from "../streaming/types.js";

interface ClaudeProviderOptions {
  model?: string;
  apiKey?: string;
  maxTokens?: number;
}

// Claude API 的消息格式转换
function toClaudeMessages(messages: Message[]) {
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const rest = messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      if (m.role === "assistant" && m.tool_calls?.length) {
        return {
          role: "assistant" as const,
          content: [
            ...(m.content ? [{ type: "text" as const, text: m.content }] : []),
            ...m.tool_calls.map((tc) => ({
              type: "tool_use" as const,
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments),
            })),
          ],
        };
      }
      if (m.role === "tool") {
        return {
          role: "user" as const,
          content: [
            {
              type: "tool_result" as const,
              tool_use_id: m.tool_call_id,
              content: m.content ?? "",
            },
          ],
        };
      }
      return { role: m.role as "user" | "assistant", content: m.content ?? "" };
    });
  return { system, messages: rest };
}

function toClaudeTools(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

export class ClaudeProvider implements LLMProvider {
  name: string;
  private model: string;
  private apiKey: string;
  private maxTokens: number;

  constructor(opts: ClaudeProviderOptions = {}) {
    this.model = opts.model ?? "claude-sonnet-4-20250514";
    this.name = `claude/${this.model}`;
    this.apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
    this.maxTokens = opts.maxTokens ?? 4096;
  }

  // ── 非流式 ────────────────────────────────────────
  async chat(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    const { system, messages: claudeMessages } = toClaudeMessages(messages);

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.maxTokens,
      system,
      messages: claudeMessages,
    };
    if (tools?.length) {
      body.tools = toClaudeTools(tools);
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json() as Record<string, any>;

    let content = "";
    const toolCalls: ToolCallMessage[] = [];

    for (const block of data.content ?? []) {
      if (block.type === "text") content += block.text;
      if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          type: "function",
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input),
          },
        });
      }
    }

    return {
      content: content || null,
      toolCalls,
      usage: data.usage
        ? { promptTokens: data.usage.input_tokens, completionTokens: data.usage.output_tokens }
        : undefined,
    };
  }

  // ── 流式 ──────────────────────────────────────────
  async *stream(
    messages: Message[],
    tools?: ToolDefinition[]
  ): AsyncIterable<StreamChunk> {
    const { system, messages: claudeMessages } = toClaudeMessages(messages);

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.maxTokens,
      stream: true,
      system,
      messages: claudeMessages,
    };
    if (tools?.length) {
      body.tools = toClaudeTools(tools);
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    // 解析 SSE 流
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let currentToolIndex = 0;
    let currentToolId = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // 最后一行可能不完整

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === "[DONE]") continue;

        let event: Record<string, any>;
        try {
          event = JSON.parse(raw);
        } catch {
          continue;
        }

        switch (event.type) {
          case "content_block_start": {
            const block = event.content_block;
            if (block.type === "tool_use") {
              currentToolId = block.id;
              yield {
                type: "tool_call_start",
                content: "",
                toolCallId: block.id,
                toolName: block.name,
                index: currentToolIndex,
              };
            }
            break;
          }

          case "content_block_delta": {
            const delta = event.delta;
            if (delta.type === "text_delta") {
              yield { type: "text", content: delta.text };
            } else if (delta.type === "input_json_delta") {
              yield {
                type: "tool_call_delta",
                content: delta.partial_json,
                index: currentToolIndex,
              };
            }
            break;
          }

          case "content_block_stop": {
            if (currentToolId) {
              yield {
                type: "tool_call_end",
                content: "",
                index: currentToolIndex,
              };
              currentToolIndex++;
              currentToolId = "";
            }
            break;
          }

          case "message_stop": {
            yield { type: "finish", content: "" };
            break;
          }
        }
      }
    }
  }
}
