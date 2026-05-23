// OpenAI Provider（非流式）
// 同样适用于所有 OpenAI 兼容 API（火山引擎、DeepSeek 等）

import OpenAI from "openai";
import type { LLMProvider, LLMResponse, Message, ToolDefinition } from "./types.js";

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
}
