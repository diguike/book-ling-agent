import Anthropic from "@anthropic-ai/sdk";
import type {
  LLMProvider, LLMResponse, Message, StreamChunk, Tool, ToolCall,
} from "./types.js";

/** 把统一 Tool 转成 Claude 格式 */
function toClaudeTools(tools: Tool[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Anthropic.Tool.InputSchema,
  }));
}

/**
 * Claude 的消息格式跟 OpenAI 有个关键区别：
 * system message 不放在 messages 数组里，而是单独传。
 * 这个函数把 system 提出来，剩下的转成 Claude 格式。
 */
function splitSystemAndMessages(messages: Message[]): {
  system: string | undefined;
  claudeMessages: Anthropic.MessageParam[];
} {
  let system: string | undefined;
  const claudeMessages: Anthropic.MessageParam[] = [];

  for (const msg of messages) {
    switch (msg.role) {
      case "system":
        // Claude 只支持一个 system，多个就拼起来
        system = system ? `${system}\n\n${msg.content}` : msg.content;
        break;

      case "user":
        claudeMessages.push({ role: "user", content: msg.content });
        break;

      case "assistant": {
        // Claude 的 assistant 消息 content 是数组
        const content: Anthropic.ContentBlockParam[] = [];
        if (msg.content) {
          content.push({ type: "text", text: msg.content });
        }
        // tool_use 直接嵌在 content 数组里——这是 Claude 最独特的设计
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            content.push({
              type: "tool_use",
              id: tc.id,
              name: tc.name,
              input: JSON.parse(tc.arguments),
            });
          }
        }
        claudeMessages.push({ role: "assistant", content });
        break;
      }

      case "tool":
        // tool_result 也放在 user 消息的 content 数组里
        claudeMessages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: msg.toolCallId,
              content: msg.content,
            },
          ],
        });
        break;
    }
  }

  return { system, claudeMessages };
}

/** 从 Claude 响应提取 ToolCall */
function extractToolCalls(content: Anthropic.ContentBlock[]): ToolCall[] {
  return content
    .filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use")
    .map((block) => ({
      id: block.id,
      name: block.name,
      arguments: JSON.stringify(block.input),
    }));
}

/** 从 Claude 响应提取文本 */
function extractText(content: Anthropic.ContentBlock[]): string | null {
  const texts = content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text);
  return texts.length > 0 ? texts.join("") : null;
}

export class ClaudeProvider implements LLMProvider {
  readonly name = "claude";
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.model = model;
    this.client = new Anthropic({ apiKey });
  }

  async chat(messages: Message[], tools?: Tool[]): Promise<LLMResponse> {
    const { system, claudeMessages } = splitSystemAndMessages(messages);

    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system,
      messages: claudeMessages,
      tools: tools?.length ? toClaudeTools(tools) : undefined,
    });

    return {
      content: extractText(res.content),
      toolCalls: extractToolCalls(res.content),
      finishReason: res.stop_reason === "tool_use" ? "tool_calls"
        : res.stop_reason === "end_turn" ? "stop"
        : res.stop_reason === "max_tokens" ? "length"
        : "unknown",
    };
  }

  async *stream(messages: Message[], tools?: Tool[]): AsyncIterableIterator<StreamChunk> {
    const { system, claudeMessages } = splitSystemAndMessages(messages);

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 4096,
      system,
      messages: claudeMessages,
      tools: tools?.length ? toClaudeTools(tools) : undefined,
    });

    for await (const event of stream) {
      switch (event.type) {
        case "content_block_start":
          if (event.content_block.type === "tool_use") {
            yield {
              type: "tool_call_start",
              toolCall: {
                id: event.content_block.id,
                name: event.content_block.name,
              },
            };
          }
          break;

        case "content_block_delta":
          if (event.delta.type === "text_delta") {
            yield { type: "text", content: event.delta.text };
          } else if (event.delta.type === "input_json_delta") {
            yield {
              type: "tool_call_delta",
              toolCall: { arguments: event.delta.partial_json },
            };
          }
          break;

        case "content_block_stop":
          // 简化处理：不区分是文本还是工具结束
          break;
      }
    }
  }
}
