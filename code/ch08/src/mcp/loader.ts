// src/mcp/loader.ts — 从 mcp.json 加载并启动所有 MCP Server

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { McpClient } from "./client.js";
import type { McpConfig, McpToolDefinition } from "./types.js";

/** 注册到 ToolRegistry 的 MCP 工具描述 */
export interface McpRegisteredTool {
  /** 格式：mcp__<server>__<tool> */
  name: string;
  description: string;
  inputSchema: McpToolDefinition["inputSchema"];
  /** 调用时委托给哪个 client */
  client: McpClient;
  /** server 上的原始工具名 */
  remoteName: string;
}

/**
 * 加载 mcp.json，启动所有 server，返回注册好的工具列表
 */
export async function loadMcpServers(
  projectRoot: string
): Promise<{
  clients: McpClient[];
  tools: McpRegisteredTool[];
}> {
  const configPath = join(projectRoot, ".ling", "mcp.json");
  let config: McpConfig;

  try {
    const raw = await readFile(configPath, "utf-8");
    config = JSON.parse(raw);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return { clients: [], tools: [] };
    }
    console.error(`[mcp] Failed to load ${configPath}:`, err.message);
    return { clients: [], tools: [] };
  }

  const clients: McpClient[] = [];
  const tools: McpRegisteredTool[] = [];

  for (const [serverName, serverConfig] of Object.entries(
    config.mcpServers
  )) {
    const client = new McpClient(serverName, serverConfig);

    try {
      await client.connect();
      clients.push(client);

      // 把 server 的工具注册到全局，加上命名前缀
      for (const tool of client.tools) {
        tools.push({
          name: `mcp__${serverName}__${tool.name}`,
          description: `[MCP:${serverName}] ${tool.description}`,
          inputSchema: tool.inputSchema,
          client,
          remoteName: tool.name,
        });
      }
    } catch (err: any) {
      console.error(
        `[mcp] Failed to connect to ${serverName}:`,
        err.message
      );
    }
  }

  console.log(
    `[mcp] ${clients.length} server(s), ${tools.length} tool(s) total`
  );
  return { clients, tools };
}

/**
 * 关闭所有 MCP server 连接
 */
export async function shutdownMcpServers(
  clients: McpClient[]
): Promise<void> {
  await Promise.all(clients.map((c) => c.disconnect()));
}
