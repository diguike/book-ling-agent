// Provider 工厂——根据配置创建对应的 LLM Provider

import type { LLMProvider } from "./types.js";
import { OpenAIProvider } from "./openai.js";
import { ClaudeProvider } from "./claude.js";
import { createVolcanoProvider } from "./volcano.js";

export type ProviderName = "openai" | "claude" | "volcano";

export function createProvider(name?: ProviderName, model?: string): LLMProvider {
  const provider = name ?? (process.env.LLM_PROVIDER as ProviderName) ?? "openai";

  switch (provider) {
    case "openai":
      return new OpenAIProvider({ model: model ?? process.env.LLM_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o" });
    case "claude":
      return new ClaudeProvider({ model: model ?? process.env.CLAUDE_MODEL });
    case "volcano":
      return createVolcanoProvider(model ?? process.env.VOLCANO_MODEL);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
