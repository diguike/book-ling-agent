// src/mcp/client.ts — MCP Client（stdio 传输）

import { spawn, type ChildProcess } from "node:child_process";
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  InitializeResult,
  McpToolDefinition,
  ToolsListResult,
  ToolCallResult,
  McpServerConfig,
} from "./types.js";

export class McpClient {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pending = new Map<
    number,
    { resolve: (v: any) => void; reject: (e: Error) => void }
  >();
  private buffer = "";
  private serverName: string;
  private config: McpServerConfig;
  private _tools: McpToolDefinition[] = [];

  constructor(serverName: string, config: McpServerConfig) {
    this.serverName = serverName;
    this.config = config;
  }

  get tools(): McpToolDefinition[] {
    return this._tools;
  }

  get name(): string {
    return this.serverName;
  }

  /** 启动子进程并完成 MCP 握手 */
  async connect(): Promise<InitializeResult> {
    this.process = spawn(this.config.command, this.config.args ?? [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...this.config.env },
    });

    // 监听 stdout，按行解析 JSON-RPC 响应
    this.process.stdout!.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });

    this.process.stderr!.on("data", (chunk: Buffer) => {
      console.error(`[mcp:${this.serverName}] ${chunk.toString().trim()}`);
    });

    this.process.on("exit", (code) => {
      console.log(`[mcp:${this.serverName}] Process exited (code=${code})`);
      // 拒绝所有等待中的请求
      for (const [, { reject }] of this.pending) {
        reject(new Error(`MCP server exited with code ${code}`));
      }
      this.pending.clear();
    });

    // 握手：initialize
    const initResult = await this.request<InitializeResult>("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "ling", version: "0.8.0" },
    });

    // 发送 initialized 通知（无需等响应）
    this.notify("notifications/initialized", {});

    // 发现工具
    const toolsResult = await this.request<ToolsListResult>("tools/list", {});
    this._tools = toolsResult.tools;

    console.log(
      `[mcp:${this.serverName}] Connected, ${this._tools.length} tool(s): ` +
        this._tools.map((t) => t.name).join(", ")
    );

    return initResult;
  }

  /** 调用 MCP 工具 */
  async callTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolCallResult> {
    return this.request<ToolCallResult>("tools/call", {
      name: toolName,
      arguments: args,
    });
  }

  /** 关闭连接 */
  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
    }
  }

  /** 发送 JSON-RPC 请求并等待响应 */
  private request<T>(
    method: string,
    params: Record<string, unknown>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      this.pending.set(id, { resolve, reject });

      const msg: JsonRpcRequest = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      this.send(msg);

      // 超时兜底
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Request ${method} timed out (id=${id})`));
        }
      }, 30_000);
    });
  }

  /** 发送通知（不需要响应） */
  private notify(method: string, params: Record<string, unknown>): void {
    const msg = { jsonrpc: "2.0" as const, method, params };
    this.send(msg);
  }

  /** 写 JSON 到子进程 stdin */
  private send(msg: object): void {
    if (!this.process?.stdin?.writable) {
      throw new Error(`MCP server ${this.serverName} is not connected`);
    }
    const json = JSON.stringify(msg);
    this.process.stdin.write(json + "\n");
  }

  /** 解析 stdout 缓冲区中的完整 JSON 行 */
  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    // 最后一个元素可能是不完整的行，留在缓冲区
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const msg = JSON.parse(trimmed) as JsonRpcResponse;
        if (msg.id != null && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);

          if (msg.error) {
            reject(
              new Error(`MCP error ${msg.error.code}: ${msg.error.message}`)
            );
          } else {
            resolve(msg.result);
          }
        }
      } catch {
        // 非 JSON 行，忽略
      }
    }
  }
}
