// OpenAI 流式实现
// 同样适用于所有 OpenAI 兼容 API（火山引擎、DeepSeek 等）

import OpenAI from "openai";
import type { Stream } from "openai/streaming";
import type {
  LLMProvider, LLMResponse, Message, ToolDefinition, ToolCallMessage,
} from "./types.js";
import type { StreamChunk } from "../streaming/types.js";

interface OpenAIProviderOptions {
  model: string;
  apiKey?: string;
  baseURL?: string;
}

export class OpenAIProvider implements LLMProvider {
  name: string;
  private client: OpenAI;
  private model: string;

  constructor(opts: OpenAIProviderOptions) {
    this.model = opts.model;
    this.name = `openai/${opts.model}`;
    this.client = new OpenAI({
      apiKey: opts.apiKey ?? process.env.OPENAI_API_KEY,
      baseURL: opts.baseURL ?? process.env.OPENAI_BASE_URL,
    });
  }

  // ── 非流式（保留兼容） ────────────────────────────
  async chat(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      tools: tools?.length ? tools as OpenAI.ChatCompletionTool[] : undefined,
    });

    const choice = response.choices[0];
    return {
      content: choice.message.content,
      toolCalls: (choice.message.tool_calls ?? []).map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      })),
      usage: response.usage
        ? { promptTokens: response.usage.prompt_tokens, completionTokens: response.usage.completion_tokens }
        : undefined,
    };
  }

  // ── 流式 ──────────────────────────────────────────
  async *stream(
    messages: Message[],
    tools?: ToolDefinition[]
  ): AsyncIterable<StreamChunk> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      tools: tools?.length ? tools as OpenAI.ChatCompletionTool[] : undefined,
      stream: true,
    });

    // OpenAI 流式格式：
    // data: {"choices":[{"delta":{"content":"Hello"}}]}
    // data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_xxx","function":{"name":"grep","arguments":""}}]}}]}
    // data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"pa"}}]}}]}

    for await (const event of stream as Stream<OpenAI.ChatCompletionChunk>) {
      const delta = event.choices[0]?.delta;
      if (!delta) continue;

      // 文本内容
      if (delta.content) {
        yield { type: "text", content: delta.content };
      }

      // 工具调用
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.id) {
            // 新的工具调用开始
            yield {
              type: "tool_call_start",
              content: "",
              toolCallId: tc.id,
              toolName: tc.function?.name,
              index: tc.index,
            };
          }
          if (tc.function?.arguments) {
            // 参数增量
            yield {
              type: "tool_call_delta",
              content: tc.function.arguments,
              index: tc.index,
            };
          }
        }
      }

      // 结束信号
      if (event.choices[0]?.finish_reason) {
        // 所有进行中的 tool_call 发送 end 信号
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            yield { type: "tool_call_end", content: "", index: tc.index };
          }
        }
        yield { type: "finish", content: "" };
      }
    }
  }
}
