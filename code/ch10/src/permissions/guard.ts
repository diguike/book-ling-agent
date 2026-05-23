import * as readline from "readline";
import { resolve, isAbsolute } from "path";
import { minimatch } from "minimatch";
import type { PermissionConfig, PermissionResult, ToolCallContext } from "./types.js";
import { evaluate, extractPrimaryArg } from "./matcher.js";

/**
 * PermissionGuard —— 权限守卫
 *
 * 在工具执行前拦截，根据规则决定：放行 / 确认 / 拒绝
 */
export class PermissionGuard {
  constructor(private config: PermissionConfig) {}

  /**
   * 检查一次工具调用是否被允许
   * 返回 true = 放行，返回 false = 被拒绝或用户拒绝
   */
  async check(toolName: string, params: Record<string, unknown>): Promise<boolean> {
    const primaryArg = extractPrimaryArg(toolName, params);
    const ctx: ToolCallContext = { toolName, params, primaryArg };

    // 第一关：文件系统边界检查
    const boundaryResult = this.checkBoundary(ctx);
    if (boundaryResult) {
      console.error(`\n[DENIED] ${boundaryResult}`);
      return false;
    }

    // 第二关：受保护路径检查
    const protectedResult = this.checkProtectedPath(ctx);
    if (protectedResult) {
      // 受保护路径不直接拒绝，但强制走确认流程
      return this.askUser(toolName, primaryArg, `Protected path: ${protectedResult}`);
    }

    // 第三关：规则评估
    const result = evaluate(this.config.rules, ctx);

    switch (result.action) {
      case "allow":
        return true;
      case "deny":
        console.error(`\n[DENIED] ${result.reason}`);
        return false;
      case "ask":
        return this.askUser(toolName, primaryArg, result.reason);
    }
  }

  /**
   * 文件系统边界检查
   * 返回 null = 通过，返回字符串 = 拒绝原因
   */
  private checkBoundary(ctx: ToolCallContext): string | null {
    if (!this.config.projectRoot) return null;

    // 只检查文件相关工具
    const filePath =
      typeof ctx.params.file_path === "string"
        ? ctx.params.file_path
        : typeof ctx.params.path === "string"
          ? (ctx.params.path as string)
          : null;

    if (!filePath) return null;

    const absPath = isAbsolute(filePath)
      ? resolve(filePath)
      : resolve(this.config.projectRoot, filePath);

    if (!absPath.startsWith(this.config.projectRoot)) {
      return `Path "${filePath}" is outside project root "${this.config.projectRoot}"`;
    }

    return null;
  }

  /**
   * 受保护路径检查
   */
  private checkProtectedPath(ctx: ToolCallContext): string | null {
    if (!this.config.protectedPaths) return null;

    for (const pattern of this.config.protectedPaths) {
      if (minimatch(ctx.primaryArg, pattern, { dot: true })) {
        return pattern;
      }
    }
    return null;
  }

  /**
   * 终端确认交互
   */
  private async askUser(toolName: string, primaryArg: string, reason?: string): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    });

    const display = primaryArg.length > 80 ? primaryArg.slice(0, 77) + "..." : primaryArg;

    return new Promise<boolean>((resolve) => {
      console.error(`\n╭─ Permission Required ──────────────────────╮`);
      console.error(`│  Tool: ${toolName}`);
      console.error(`│  Args: ${display}`);
      if (reason) console.error(`│  Reason: ${reason}`);
      console.error(`╰────────────────────────────────────────────╯`);

      rl.question("Allow? (Y/n): ", (answer) => {
        rl.close();
        const normalized = answer.trim().toLowerCase();
        resolve(normalized === "" || normalized === "y" || normalized === "yes");
      });
    });
  }
}
