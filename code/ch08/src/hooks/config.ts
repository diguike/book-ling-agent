// src/hooks/config.ts — 加载 .ling/hooks.json 配置

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { HooksConfig, HookRule } from "./types.js";

const DEFAULT_CONFIG: HooksConfig = { hooks: [] };

/**
 * 从 .ling/hooks.json 加载 Hook 配置
 * 文件不存在就返回空配置，不报错
 */
export async function loadHooksConfig(
  projectRoot: string
): Promise<HooksConfig> {
  const configPath = join(projectRoot, ".ling", "hooks.json");

  try {
    const raw = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return validateConfig(parsed);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return DEFAULT_CONFIG;
    }
    console.error(`[hooks] Failed to load ${configPath}:`, err.message);
    return DEFAULT_CONFIG;
  }
}

/** 基本校验：确保结构合法 */
function validateConfig(raw: unknown): HooksConfig {
  if (!raw || typeof raw !== "object") {
    throw new Error("hooks.json must be a JSON object");
  }

  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.hooks)) {
    throw new Error('hooks.json must have a "hooks" array');
  }

  const validEvents = new Set([
    "PreToolUse",
    "PostToolUse",
    "SessionStart",
    "Stop",
  ]);

  const hooks: HookRule[] = [];
  for (const item of obj.hooks) {
    if (!item || typeof item !== "object") continue;
    const rule = item as Record<string, unknown>;

    if (!validEvents.has(rule.event as string)) {
      console.warn(`[hooks] Skipping unknown event: ${rule.event}`);
      continue;
    }

    const handler = rule.handler as Record<string, unknown>;
    if (!handler || (handler.type !== "command" && handler.type !== "http")) {
      console.warn(`[hooks] Skipping invalid handler type`);
      continue;
    }

    hooks.push(rule as unknown as HookRule);
  }

  return { hooks };
}
