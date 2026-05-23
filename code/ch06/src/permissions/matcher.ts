import { minimatch } from "minimatch";
import type { PermissionRule, ToolCallContext, PermissionResult } from "./types.js";

/**
 * 检查工具名是否匹配规则
 * 支持 "*" 通配符匹配所有工具
 */
function matchTool(rule: PermissionRule, toolName: string): boolean {
  if (rule.tool === "*") return true;
  return rule.tool === toolName;
}

/**
 * 用 glob 模式匹配工具参数
 * 没有 pattern 的规则自动匹配所有参数
 */
function matchPattern(rule: PermissionRule, primaryArg: string): boolean {
  if (!rule.pattern) return true;
  return minimatch(primaryArg, rule.pattern, { dot: true });
}

/**
 * 从工具调用参数中提取"主参数"
 * bash → command, read_file/write_file → file_path, 其他 → JSON 序列化
 */
export function extractPrimaryArg(toolName: string, params: Record<string, unknown>): string {
  if (toolName === "bash" && typeof params.command === "string") {
    return params.command;
  }
  if (typeof params.file_path === "string") {
    return params.file_path;
  }
  if (typeof params.path === "string") {
    return params.path;
  }
  return JSON.stringify(params);
}

/**
 * 核心评估逻辑：按 deny → ask → allow 的优先级匹配规则
 *
 * 规则匹配顺序：
 * 1. 遍历所有 deny 规则，任一命中就拒绝
 * 2. 遍历所有 ask 规则，任一命中就要求确认
 * 3. 遍历所有 allow 规则，任一命中就放行
 * 4. 都没命中 → 默认 ask（安全第一）
 */
export function evaluate(rules: PermissionRule[], ctx: ToolCallContext): PermissionResult {
  // 第一轮：deny
  for (const rule of rules) {
    if (rule.action !== "deny") continue;
    if (matchTool(rule, ctx.toolName) && matchPattern(rule, ctx.primaryArg)) {
      return { action: "deny", rule, reason: rule.reason ?? `Blocked by deny rule: ${rule.pattern ?? rule.tool}` };
    }
  }

  // 第二轮：ask
  for (const rule of rules) {
    if (rule.action !== "ask") continue;
    if (matchTool(rule, ctx.toolName) && matchPattern(rule, ctx.primaryArg)) {
      return { action: "ask", rule, reason: rule.reason ?? `Requires confirmation` };
    }
  }

  // 第三轮：allow
  for (const rule of rules) {
    if (rule.action !== "allow") continue;
    if (matchTool(rule, ctx.toolName) && matchPattern(rule, ctx.primaryArg)) {
      return { action: "allow", rule };
    }
  }

  // 兜底：没有匹配的规则，默认要求确认
  return { action: "ask", reason: "No matching rule — defaulting to ask" };
}
