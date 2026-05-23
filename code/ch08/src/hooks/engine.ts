// src/hooks/engine.ts — HookEngine：注册、匹配、触发、执行

import { spawn } from "node:child_process";
import type {
  HookEvent,
  HookContext,
  HookResult,
  HookRule,
  HooksConfig,
  CommandHandler,
  HttpHandler,
} from "./types.js";

export class HookEngine {
  private rules: HookRule[] = [];

  /** 从配置加载所有规则 */
  load(config: HooksConfig): void {
    this.rules = config.hooks;
    console.log(`[hooks] Loaded ${this.rules.length} hook(s)`);
  }

  /** 手动注册一条规则 */
  register(rule: HookRule): void {
    this.rules.push(rule);
  }

  /**
   * 触发某个事件，返回所有 handler 的结果
   * 对于 PreToolUse：如果任一 handler 返回 blocked=true，工具调用会被拦截
   */
  async trigger(ctx: HookContext): Promise<HookResult[]> {
    const matched = this.match(ctx);
    if (matched.length === 0) return [];

    const results: HookResult[] = [];

    for (const rule of matched) {
      if (rule.async) {
        // 异步：fire-and-forget
        this.execute(rule, ctx).catch((err) =>
          console.error(`[hooks] Async handler error:`, err.message)
        );
        results.push({ ok: true, output: "(async, no wait)" });
      } else {
        // 同步：等结果
        const result = await this.execute(rule, ctx);
        results.push(result);

        // PreToolUse 时，如果被拦截就不再执行后续 handler
        if (ctx.event === "PreToolUse" && result.blocked) {
          break;
        }
      }
    }

    return results;
  }

  /** 按事件类型 + matcher 正则匹配规则 */
  private match(ctx: HookContext): HookRule[] {
    return this.rules.filter((rule) => {
      // 事件类型必须匹配
      if (rule.event !== ctx.event) return false;

      // 如果有 matcher 正则，只对 PreToolUse / PostToolUse 生效
      if (rule.matcher && ctx.toolCall) {
        const regex = new RegExp(rule.matcher);
        return regex.test(ctx.toolCall.tool);
      }

      // 没有 matcher，匹配该事件的所有触发
      return true;
    });
  }

  /** 分发到具体的 handler 执行 */
  private async execute(
    rule: HookRule,
    ctx: HookContext
  ): Promise<HookResult> {
    try {
      switch (rule.handler.type) {
        case "command":
          return await this.executeCommand(rule.handler, ctx);
        case "http":
          return await this.executeHttp(rule.handler, ctx);
        default:
          return { ok: false, error: `Unknown handler type` };
      }
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /** 执行 shell 命令，把 HookContext 通过 stdin 传入 */
  private executeCommand(
    handler: CommandHandler,
    ctx: HookContext
  ): Promise<HookResult> {
    return new Promise((resolve) => {
      const timeout = handler.timeout ?? 10_000;
      const child = spawn("sh", ["-c", handler.command], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      // 把上下文 JSON 写入 stdin
      child.stdin.write(JSON.stringify(ctx));
      child.stdin.end();

      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        resolve({ ok: false, error: `Command timed out after ${timeout}ms` });
      }, timeout);

      child.on("close", (code) => {
        clearTimeout(timer);

        if (code === 0) {
          // 尝试解析 stdout 为 JSON，提取 modifiedParams / blocked
          const result: HookResult = { ok: true, output: stdout.trim() };
          try {
            const parsed = JSON.parse(stdout);
            if (parsed.modifiedParams) {
              result.modifiedParams = parsed.modifiedParams;
            }
            if (parsed.blocked) {
              result.blocked = true;
              result.blockReason = parsed.blockReason ?? "Blocked by hook";
            }
          } catch {
            // stdout 不是 JSON，没关系
          }
          resolve(result);
        } else {
          resolve({
            ok: false,
            error: stderr.trim() || `Exit code ${code}`,
          });
        }
      });
    });
  }

  /** POST JSON 到 URL */
  private async executeHttp(
    handler: HttpHandler,
    ctx: HookContext
  ): Promise<HookResult> {
    const timeout = handler.timeout ?? 5_000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const resp = await fetch(handler.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...handler.headers,
        },
        body: JSON.stringify(ctx),
        signal: controller.signal,
      });

      clearTimeout(timer);
      const body = await resp.text();

      if (!resp.ok) {
        return { ok: false, error: `HTTP ${resp.status}: ${body}` };
      }

      return { ok: true, output: body };
    } catch (err: any) {
      clearTimeout(timer);
      return { ok: false, error: err.message };
    }
  }
}
