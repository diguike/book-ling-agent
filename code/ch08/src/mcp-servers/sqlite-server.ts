#!/usr/bin/env node
// sqlite-server.ts — 一个最小的 SQLite MCP Server
// 暴露 list_tables 和 query 两个工具

import Database from "better-sqlite3";
import { createInterface } from "node:readline";

// ---- MCP Server 骨架 ----

let db: Database.Database;

/** 工具定义 */
const TOOLS = [
  {
    name: "list_tables",
    description: "List all tables in the SQLite database",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "query",
    description: "Execute a read-only SQL query",
    inputSchema: {
      type: "object" as const,
      properties: {
        sql: {
          type: "string",
          description: "The SQL query to execute (SELECT only)",
        },
      },
      required: ["sql"],
    },
  },
];

/** 处理 JSON-RPC 请求 */
function handleRequest(msg: {
  jsonrpc: string;
  id?: number;
  method: string;
  params?: any;
}): object | null {
  // 通知没有 id，不需要响应
  if (msg.id == null) return null;

  switch (msg.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "sqlite-server", version: "0.1.0" },
        },
      };

    case "tools/list":
      return {
        jsonrpc: "2.0",
        id: msg.id,
        result: { tools: TOOLS },
      };

    case "tools/call":
      return handleToolCall(msg.id, msg.params);

    default:
      return {
        jsonrpc: "2.0",
        id: msg.id,
        error: { code: -32601, message: `Unknown method: ${msg.method}` },
      };
  }
}

function handleToolCall(
  id: number,
  params: { name: string; arguments: Record<string, unknown> }
): object {
  const { name, arguments: args } = params;

  try {
    switch (name) {
      case "list_tables": {
        const rows = db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
          )
          .all() as { name: string }[];
        const tables = rows.map((r) => r.name);
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(tables, null, 2) }],
          },
        };
      }

      case "query": {
        const sql = args.sql as string;
        // 安全检查：只允许 SELECT
        if (!/^\s*SELECT\b/i.test(sql)) {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                { type: "text", text: "Error: Only SELECT queries allowed" },
              ],
              isError: true,
            },
          };
        }
        const rows = db.prepare(sql).all();
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
          },
        };
      }

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Unknown tool: ${name}` },
        };
    }
  } catch (err: any) {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      },
    };
  }
}

// ---- 启动 ----

const dbPath = process.argv[2];
if (!dbPath) {
  console.error("Usage: sqlite-server <database-path>");
  process.exit(1);
}

db = new Database(dbPath, { readonly: true });
console.error(`[sqlite-server] Opened ${dbPath}`);

// 逐行读 stdin，解析 JSON-RPC，写回 stdout
const rl = createInterface({ input: process.stdin });

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const msg = JSON.parse(trimmed);
    const response = handleRequest(msg);
    if (response) {
      process.stdout.write(JSON.stringify(response) + "\n");
    }
  } catch {
    // 解析失败，忽略
  }
});
