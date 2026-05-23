// src/ling.ts — 集成 Hook 和 MCP 的 Agent Loop（第 8 章版本）

import OpenAI from "openai";
import { HookEngine, loadHooksConfig } from "./hooks/index.js";
import type { HookContext, HookResult } from "./hooks/index.js";
import {
  loadMcpServers,
  shutdownMcpServers,
} from "./mcp/index.js";
import type { McpRegisteredTool } from "./mcp/index.js";
import { randomUUID } from "node:crypto";

const openai = new OpenAI();

/** 内置工具（简化版，前几章已有完整实现） */
const BUILTIN_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "bash",
      description: "Execute a shell command",
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file",
      parameters: {
        type: "object",
        properties: { file_path: { type: "string" } },
        required: ["file_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Edit a file by replacing text",
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string" },
          old_string: { type: "string" },
          new_string: { type: "string" },
        },
        required: ["file_path", "old_string", "new_string"],
      },
    },
  },
];

// ---- MCP 工具转为 OpenAI function 格式 ----

function mcpToolToOpenAI(
  tool: McpRegisteredTool
): OpenAI.ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema as any,
    },
  };
}

// ---- 工具执行 ----

async function executeBuiltinTool(
  name: string,
  params: Record<string, unknown>
): Promise<string> {
  // 简化实现，真实版本见前几章
  return `[mock] ${name}(${JSON.stringify(params)})`;
}

async function executeMcpTool(
  tool: McpRegisteredTool,
  args: Record<string, unknown>
): Promise<string> {
  const result = await tool.client.callTool(tool.remoteName, args);

  // 提取文本内容
  return result.content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text!)
    .join("\n");
}

// ---- 主循环 ----

async function main() {
  const projectRoot = process.cwd();
  const sessionId = randomUUID();

  // 1. 加载 Hook
  const hookEngine = new HookEngine();
  const hooksConfig = await loadHooksConfig(projectRoot);
  hookEngine.load(hooksConfig);

  // 2. 加载 MCP
  const { clients: mcpClients, tools: mcpTools } =
    await loadMcpServers(projectRoot);

  // 把 MCP 工具和内置工具合并
  const mcpToolMap = new Map(mcpTools.map((t) => [t.name, t]));
  const allTools: OpenAI.ChatCompletionTool[] = [
    ...BUILTIN_TOOLS,
    ...mcpTools.map(mcpToolToOpenAI),
  ];

  console.log(
    `Ling ready. ${BUILTIN_TOOLS.length} built-in + ${mcpTools.length} MCP tools.\n`
  );

  // 3. 触发 SessionStart hook
  await hookEngine.trigger({
    event: "SessionStart",
    sessionId,
    timestamp: Date.now(),
  });

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: "You are Ling, a coding assistant." },
  ];

  // 简化：只跑一轮对话
  const userInput =
    process.argv[2] ?? "List all tables in the database";
  messages.push({ role: "user", content: userInput });
  console.log(`User: ${userInput}\n`);

  // Agent loop
  while (true) {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools: allTools,
    });

    const choice = response.choices[0];
    const msg = choice.message;
    messages.push(msg);

    // 没有工具调用 → 输出回复并结束
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      console.log(`Ling: ${msg.content}\n`);

      // 触发 Stop hook
      await hookEngine.trigger({
        event: "Stop",
        sessionId,
        timestamp: Date.now(),
      });
      break;
    }

    // 处理工具调用
    for (const call of msg.tool_calls) {
      const toolName = call.function.name;
      let toolParams = JSON.parse(call.function.arguments);

      console.log(`[tool] ${toolName}(${call.function.arguments})`);

      // ---- PreToolUse Hook ----
      const preCtx: HookContext = {
        event: "PreToolUse",
        sessionId,
        timestamp: Date.now(),
        toolCall: { tool: toolName, params: toolParams },
      };
      const preResults = await hookEngine.trigger(preCtx);

      // 检查是否被拦截
      const blocked = preResults.find((r) => r.blocked);
      if (blocked) {
        console.log(`[hook] Blocked: ${blocked.blockReason}`);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: `Tool call blocked by hook: ${blocked.blockReason}`,
        });
        continue;
      }

      // 检查是否有参数修改
      const modified = preResults.find((r) => r.modifiedParams);
      if (modified?.modifiedParams) {
        toolParams = { ...toolParams, ...modified.modifiedParams };
        console.log(`[hook] Params modified`);
      }

      // ---- 执行工具 ----
      let result: string;
      const mcpTool = mcpToolMap.get(toolName);

      if (mcpTool) {
        result = await executeMcpTool(mcpTool, toolParams);
      } else {
        result = await executeBuiltinTool(toolName, toolParams);
      }

      console.log(`[result] ${result.slice(0, 200)}\n`);

      // ---- PostToolUse Hook ----
      await hookEngine.trigger({
        event: "PostToolUse",
        sessionId,
        timestamp: Date.now(),
        toolCall: { tool: toolName, params: toolParams, result },
      });

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result,
      });
    }
  }

  // 清理
  await shutdownMcpServers(mcpClients);
}

main().catch(console.error);
