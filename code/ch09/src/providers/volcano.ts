import OpenAI from "openai";
import type {
  LLMProvider, LLMResponse, Message, StreamChunk, Tool, ToolCall,
} from "./types.js";

/** 把我们的统一 Tool 转成 OpenAI 格式 */
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

/** 把统一 Message 转成 OpenAI 格式 */
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

/** 把 OpenAI 的 tool_calls 转成我们的统一格式 */
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

export class VolcanoProvider implements LLMProvider {
  readonly name = "volcano";
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string, baseURL?: string) {
    this.model = model;
    this.client = new OpenAI({
      apiKey,
      // 火山引擎的 endpoint，注意不是 OpenAI 官方地址
      baseURL: baseURL || "https://ark.cn-beijing.volces.com/api/v3",
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

      // 文本内容
      if (delta.content) {
        yield { type: "text", content: delta.content };
      }

      // 工具调用
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
