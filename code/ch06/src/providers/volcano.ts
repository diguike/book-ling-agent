// 火山引擎（豆包）流式实现
// 火山引擎兼容 OpenAI 协议，所以直接复用 OpenAIProvider

import { OpenAIProvider } from "./openai.js";

export function createVolcanoProvider(model?: string): OpenAIProvider {
  return new OpenAIProvider({
    model: model ?? "doubao-pro-32k",
    apiKey: process.env.VOLCANO_API_KEY,
    baseURL: "https://ark.cn-beijing.volces.com/api/v3",
  });
}
