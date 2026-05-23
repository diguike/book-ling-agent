// Claude Provider（非流式）

import type {
  LLMProvider, LLMResponse, Message, ToolDefinition, ToolCallMessage,
} from "./types.js";

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
}
