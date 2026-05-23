// Ling Agent — ch06: 流式交互
// 从 batch 模式升级到 streaming，边想边说

import * as readline from "readline";
import { createToolRegistry } from "./tools/index.js";
import { PermissionGuard, loadPermissionConfig } from "./permissions/index.js";
import { createProvider } from "./providers/factory.js";
import { StreamRenderer } from "./streaming/renderer.js";
import { ToolCallCollector } from "./streaming/collector.js";
import type { Message, ToolDefinition } from "./providers/types.js";
import type { StreamChunk } from "./streaming/types.js";

// ── 初始化 ──────────────────────────────────────────
const registry = createToolRegistry();
const config = loadPermissionConfig();
const guard = new PermissionGuard(config);
const provider = createProvider();
const renderer = new StreamRenderer();

const systemPrompt = `You are Ling, a coding assistant. You have access to tools to read, write, edit files, search code, and run commands. Use tools to accomplish tasks step by step.`;

// 将 ToolRegistry 的工具转成 Provider 通用格式
function getToolDefinitions(): ToolDefinition[] {
  return registry.list().map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.schema,
    },
  }));
}

// ── 流式 Agent Loop ─────────────────────────────────
async function agentLoop(userMessage: string, history: Message[]): Promise<void> {
  history.push({ role: "user", content: userMessage });

  const tools = getToolDefinitions();

  while (true) {
    renderer.reset();

    const collector = new ToolCallCollector();
    let fullText = "";

    // ---- 流式接收 LLM 响应 ----
    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      ...history,
    ];

    for await (const chunk of provider.stream(messages, tools)) {
      // 1. 渲染到终端
      renderer.onChunk(chunk);

      // 2. 收集文本
      if (chunk.type === "text") {
        fullText += chunk.content;
      }

      // 3. 收集工具调用片段
      collector.feed(chunk);
    }

    // ---- 收集结果 ----
    const toolCalls = collector.drain();

    // 没有工具调用 → 纯文本回复，结束循环
    if (toolCalls.length === 0) {
      history.push({ role: "assistant", content: fullText || "(no response)" });
      return;
    }

    // 有工具调用 → 记录到历史，然后执行
    history.push({
      role: "assistant",
      content: fullText || null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    // ---- 执行工具 ----
    for (const toolCall of toolCalls) {
      const name = toolCall.name;
      let params: Record<string, unknown>;
      try {
        params = JSON.parse(toolCall.arguments);
      } catch {
        history.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: `Error: invalid JSON in tool arguments`,
        });
        continue;
      }

      // 权限检查
      const allowed = await guard.check(name, params);
      if (!allowed) {
        history.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: `Permission denied: this operation was blocked by the permission system.`,
        });
        continue;
      }

      // 执行工具（带 spinner）
      const summary = JSON.stringify(params).slice(0, 60);
      renderer.startToolExecution(name, summary);

      let result: string;
      let success = true;
      try {
        result = await registry.execute(name, params);
      } catch (err) {
        result = `Error: ${(err as Error).message}`;
        success = false;
      }

      renderer.stopToolExecution(name, success);

      history.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }

    // 继续循环——让 LLM 看到工具结果后决定下一步
  }
}

// ── REPL 主循环 ──────────────────────────────────────
async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const history: Message[] = [];

  console.log(`Ling Agent (ch06) — streaming mode`);
  console.log(`Provider: ${provider.name}`);
  console.log(`Tools: ${registry.list().map((t) => t.name).join(", ")}\n`);

  const prompt = () => {
    rl.question("\nYou: ", async (input) => {
      if (!input.trim()) return prompt();
      if (input.trim() === "/quit") {
        rl.close();
        process.exit(0);
      }

      try {
        await agentLoop(input, history);
      } catch (err) {
        console.error(`\nError: ${(err as Error).message}\n`);
      }
      prompt();
    });
  };
  prompt();
}

main();
