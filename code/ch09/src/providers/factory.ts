import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import type { LLMProvider, ProviderConfig } from "./types.js";
import { VolcanoProvider } from "./volcano.js";
import { ClaudeProvider } from "./claude.js";
import { OpenAIProvider } from "./openai.js";

/** 从 .ling.json 读取配置 */
function loadConfigFile(): Partial<ProviderConfig> | null {
  const configPath = resolve(process.cwd(), ".ling.json");
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * 配置优先级：命令行参数 > 环境变量 > .ling.json > 默认值
 *
 * 这个顺序很重要：
 * - 日常开发用 .ling.json，不用每次敲参数
 * - CI 环境用环境变量，不用提交配置文件
 * - 临时切换用命令行参数，覆盖一切
 */
export function resolveConfig(cliArgs?: Partial<ProviderConfig>): ProviderConfig {
  const fileConfig = loadConfigFile();

  const provider = cliArgs?.provider
    || (process.env.LING_PROVIDER as ProviderConfig["provider"])
    || fileConfig?.provider
    || "volcano";

  const apiKey = cliArgs?.apiKey
    || process.env.LING_API_KEY
    || process.env.LLM_API_KEY  // 兼容 ch01 的环境变量
    || fileConfig?.apiKey
    || "";

  const defaultModels: Record<string, string> = {
    volcano: "doubao-1.5-pro-32k-250115",
    claude: "claude-sonnet-4-20250514",
    openai: "gpt-4o",
  };

  const model = cliArgs?.model
    || process.env.LING_MODEL
    || process.env.LLM_MODEL
    || fileConfig?.model
    || defaultModels[provider];

  const baseURL = cliArgs?.baseURL
    || process.env.LING_BASE_URL
    || process.env.LLM_BASE_URL
    || fileConfig?.baseURL;

  return { provider, apiKey, model, baseURL };
}

/** 根据配置创建 Provider 实例 */
export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.provider) {
    case "volcano":
      return new VolcanoProvider(config.apiKey, config.model, config.baseURL);
    case "claude":
      return new ClaudeProvider(config.apiKey, config.model);
    case "openai":
      return new OpenAIProvider(config.apiKey, config.model, config.baseURL);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

/** 一步到位：解析配置 + 创建 Provider */
export function initProvider(cliArgs?: Partial<ProviderConfig>): LLMProvider {
  const config = resolveConfig(cliArgs);
  if (!config.apiKey) {
    console.error(
      `Error: No API key found. Set LING_API_KEY environment variable or add "apiKey" to .ling.json`,
    );
    process.exit(1);
  }
  console.log(`[ling] Using ${config.provider} / ${config.model}`);
  return createProvider(config);
}
