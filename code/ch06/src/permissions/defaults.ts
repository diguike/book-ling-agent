import type { PermissionRule } from "./types.js";

/**
 * 默认权限规则
 *
 * 设计原则：宁可多拦一次，不可多放一次
 */
export const defaultRules: PermissionRule[] = [
  // ============ DENY：绝对禁止的危险操作 ============
  { tool: "bash", pattern: "rm -rf /*", action: "deny", reason: "Refusing to rm -rf root" },
  { tool: "bash", pattern: "rm -rf /", action: "deny", reason: "Refusing to rm -rf root" },
  { tool: "bash", pattern: "rm -rf ~", action: "deny", reason: "Refusing to rm -rf home" },
  { tool: "bash", pattern: "rm -rf ~/*", action: "deny", reason: "Refusing to rm -rf home" },
  { tool: "bash", pattern: "dd *", action: "deny", reason: "dd is too dangerous for an agent" },
  { tool: "bash", pattern: "mkfs*", action: "deny", reason: "mkfs is too dangerous for an agent" },
  { tool: "bash", pattern: ":(){ :|:& };:*", action: "deny", reason: "Fork bomb detected" },
  { tool: "bash", pattern: "> /dev/sd*", action: "deny", reason: "Direct disk write blocked" },
  { tool: "bash", pattern: "chmod -R 777 /*", action: "deny", reason: "Mass permission change blocked" },
  { tool: "bash", pattern: "curl * | bash*", action: "deny", reason: "Piping remote script to shell blocked" },
  { tool: "bash", pattern: "wget * | bash*", action: "deny", reason: "Piping remote script to shell blocked" },

  // ============ ALLOW：安全的只读操作 ============
  { tool: "read_file", action: "allow" },
  { tool: "grep", action: "allow" },
  { tool: "glob", action: "allow" },
  { tool: "list_files", action: "allow" },
  { tool: "bash", pattern: "ls *", action: "allow" },
  { tool: "bash", pattern: "cat *", action: "allow" },
  { tool: "bash", pattern: "head *", action: "allow" },
  { tool: "bash", pattern: "tail *", action: "allow" },
  { tool: "bash", pattern: "wc *", action: "allow" },
  { tool: "bash", pattern: "git status*", action: "allow" },
  { tool: "bash", pattern: "git log*", action: "allow" },
  { tool: "bash", pattern: "git diff*", action: "allow" },
  { tool: "bash", pattern: "npm run *", action: "allow" },
  { tool: "bash", pattern: "npm test*", action: "allow" },
  { tool: "bash", pattern: "npx tsc*", action: "allow" },

  // ============ ASK：需要确认的操作 ============
  { tool: "bash", action: "ask", reason: "Shell command requires confirmation" },
  { tool: "write_file", action: "ask", reason: "File write requires confirmation" },
  { tool: "edit_file", action: "ask", reason: "File edit requires confirmation" },
];

/** 默认受保护路径——即使有 allow 规则也要确认 */
export const defaultProtectedPaths = [
  ".git/**",
  ".env*",
  ".claude/**",
  ".vscode/**",
  "node_modules/**",
  "**/*.key",
  "**/*.pem",
  "**/credentials*",
  "**/secret*",
];
