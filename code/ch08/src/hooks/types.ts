// src/hooks/types.ts — Hook 事件和 Handler 类型定义

/** Hook 事件类型 */
export type HookEvent =
  | "PreToolUse"
  | "PostToolUse"
  | "SessionStart"
  | "Stop";

/** 工具调用的上下文，传给 Hook handler */
export interface ToolCallContext {
  tool: string;
  params: Record<string, unknown>;
  result?: unknown; // PostToolUse 时才有
}

/** Hook 触发时传给 handler 的完整上下文 */
export interface HookContext {
  event: HookEvent;
  sessionId: string;
  timestamp: number;
  toolCall?: ToolCallContext;
}

/** Handler 执行结果 */
export interface HookResult {
  /** handler 是否成功 */
  ok: boolean;
  /** handler 的输出（stdout / HTTP 响应体） */
  output?: string;
  /** 出错时的信息 */
  error?: string;
  /** PreToolUse 时，handler 可以修改工具参数 */
  modifiedParams?: Record<string, unknown>;
  /** PreToolUse 时，handler 可以拦截（阻止工具执行） */
  blocked?: boolean;
  blockReason?: string;
}

/** command handler：执行 shell 命令 */
export interface CommandHandler {
  type: "command";
  command: string;
  timeout?: number; // 毫秒，默认 10000
}

/** http handler：POST JSON 到 URL */
export interface HttpHandler {
  type: "http";
  url: string;
  headers?: Record<string, string>;
  timeout?: number; // 毫秒，默认 5000
}

export type HookHandler = CommandHandler | HttpHandler;

/** 单条 Hook 规则 */
export interface HookRule {
  event: HookEvent;
  /** 正则匹配工具名（仅对 PreToolUse / PostToolUse 有效） */
  matcher?: string;
  handler: HookHandler;
  /** 是否异步执行（不阻塞 Agent 主流程），默认 false */
  async?: boolean;
}

/** hooks.json 配置文件结构 */
export interface HooksConfig {
  hooks: HookRule[];
}
