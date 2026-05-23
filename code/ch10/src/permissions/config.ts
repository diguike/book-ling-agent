import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import type { PermissionConfig, PermissionRule } from "./types.js";
import { defaultRules, defaultProtectedPaths } from "./defaults.js";

const CONFIG_FILE = ".ling/permissions.json";

/**
 * 加载权限配置
 * 优先读取项目目录下的 .ling/permissions.json，不存在就用默认规则
 */
export function loadPermissionConfig(projectRoot?: string): PermissionConfig {
  const root = projectRoot ?? process.cwd();
  const configPath = join(root, CONFIG_FILE);

  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, "utf-8");
      const userConfig = JSON.parse(raw) as Partial<PermissionConfig>;
      return {
        // 用户规则优先，追加默认规则兜底
        rules: [...(userConfig.rules ?? []), ...defaultRules],
        projectRoot: resolve(userConfig.projectRoot ?? root),
        protectedPaths: userConfig.protectedPaths ?? defaultProtectedPaths,
      };
    } catch (err) {
      console.error(`Warning: failed to parse ${configPath}, using defaults`);
    }
  }

  return {
    rules: defaultRules,
    projectRoot: resolve(root),
    protectedPaths: defaultProtectedPaths,
  };
}
