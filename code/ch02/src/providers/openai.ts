import OpenAI from "openai";
import type {
  LLMProvider, LLMResponse, Message, StreamChunk, Tool, ToolCall,
} from "./types.js";

/**
 * OpenAI Provider
 *
 * 和 VolcanoProvider 的代码几乎一样——因为火山引擎本来就是 OpenAI 兼容格式。
 * 但我们还是单独写一个，原因：
 * 1. baseURL 默认值不同
 * 2. 未来 OpenAI 可能加新功能（比如 structured outputs），火山引擎不一定跟进
 * 3. 错误处理逻辑可能不同
 */

function toOpenAITools(tools: Tool[]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

function toOpenAIMessages(messages: Message[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  return messages.map((msg) => {
    switch (msg.role) {
      case "system":
        return { role: "system" as const, content: msg.content };
      case "user":
        return { role: "user" as const, content: msg.content };
      case "assistant":
        return {
          role: "assistant" as const,
          content: msg.content,
          tool_calls: msg.toolCalls?.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.arguments },
          })),
        };
      case "tool":
        return {
          role: "tool" as const,
          tool_call_id: msg.toolCallId,
          content: msg.content,
        };
    }
  });
}

function fromOpenAIToolCalls(
  toolCalls?: OpenAI.Chat.ChatCompletionMessageToolCall[],
): ToolCall[] {
  if (!toolCalls) return [];
  return toolCalls.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: tc.function.arguments,
  }));
}

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string, baseURL?: string) {
    this.model = model;
    this.client = new OpenAI({
      apiKey,
      baseURL: baseURL || "https://api.openai.com/v1",
    });
  }

  async chat(messages: Message[], tools?: Tool[]): Promise<LLMResponse> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: toOpenAIMessages(messages),
      tools: tools?.length ? toOpenAITools(tools) : undefined,
    });

    const choice = res.choices[0];
    return {
      content: choice.message.content,
      toolCalls: fromOpenAIToolCalls(choice.message.tool_calls),
      finishReason: choice.finish_reason === "tool_calls" ? "tool_calls"
        : choice.finish_reason === "stop" ? "stop"
        : choice.finish_reason === "length" ? "length"
        : "unknown",
    };
  }

  async *stream(messages: Message[], tools?: Tool[]): AsyncIterableIterator<StreamChunk> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: toOpenAIMessages(messages),
      tools: tools?.length ? toOpenAITools(tools) : undefined,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        yield { type: "text", content: delta.content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.id) {
            yield {
              type: "tool_call_start",
              toolCall: { id: tc.id, name: tc.function?.name },
            };
          }
          if (tc.function?.arguments) {
            yield {
              type: "tool_call_delta",
              toolCall: { arguments: tc.function.arguments },
            };
          }
        }
      }
    }
  }
}
