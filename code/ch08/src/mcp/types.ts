// src/mcp/types.ts — MCP 协议消息类型（JSON-RPC 2.0 子集）

/** JSON-RPC 请求 */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

/** JSON-RPC 成功响应 */
export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/** MCP Server 能力声明 */
export interface ServerCapabilities {
  tools?: {};
  resources?: {};
  prompts?: {};
}

/** initialize 握手的响应 */
export interface InitializeResult {
  protocolVersion: string;
  capabilities: ServerCapabilities;
  serverInfo: {
    name: string;
    version: string;
  };
}

/** MCP 工具定义（从 tools/list 返回） */
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/** tools/list 的响应 */
export interface ToolsListResult {
  tools: McpToolDefinition[];
}

/** tools/call 的请求参数 */
export interface ToolCallParams {
  name: string;
  arguments: Record<string, unknown>;
}

/** tools/call 的响应 */
export interface ToolCallResult {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/** mcp.json 中单个 server 的配置 */
export interface McpServerConfig {
  /** 启动命令 */
  command: string;
  /** 命令参数 */
  args?: string[];
  /** 环境变量 */
  env?: Record<string, string>;
}

/** mcp.json 配置文件结构 */
export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}
