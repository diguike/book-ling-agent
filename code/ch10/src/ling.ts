#!/usr/bin/env node

// Ling Agent —— 完整版主入口（交互 + 非交互）
// 这是所有前面章节的集大成

import * as readline from "readline";
import { initProvider } from "./providers/index.js";
import type { Tool, Message } from "./providers/index.js";
import { parseCli, readStdin, runPrintMode } from "./cli/index.js";
import { createToolRegistry } from "./tools/index.js";
import { PermissionGuard, loadPermissionConfig } from "./permissions/index.js";

const VERSION = "0.10.0";

const HELP = `
Ling - AI Coding Agent

Usage:
  ling [options]                  Start interactive REPL
  ling -p "query"                 Non-interactive mode
  cat file | ling -p "analyze"    Pipe input + query

Options:
  -p, --print <query>    Non-interactive mode, print result and exit
  -f, --format <fmt>     Output format: text (default), json, stream
      --schema <file>    Constrain output with JSON Schema
      --provider <name>  LLM provider (default: openai)
  -m, --model <name>     Model name (default: gpt-4o)
      --max-turns <n>    Max agent loop turns (default: 10)
  -c, --continue         Resume last session
  -r, --resume <id>      Resume specific session
  -n, --name <name>      Name the session
  -h, --help             Show this help
  -v, --version          Show version
`;

async function main() {
  const options = parseCli(process.argv);

  if (options.help) {
    console.log(HELP);
    process.exit(0);
  }

  if (options.version) {
    console.log(`ling v${VERSION}`);
    process.exit(0);
  }

  // 统一初始化 Provider（CLI --provider 参数传入）
  const provider = initProvider({
    provider: options.provider as "openai" | "volcano" | "claude",
    model: options.model,
  });

  // ---- 非交互模式 ----
  if (options.print) {
    // 检查是否有 stdin 管道输入
    const stdinContent = await readStdin();
    let query = options.print;

    if (stdinContent) {
      // 把 stdin 内容拼进 query
      query = `${stdinContent}\n\n---\n\n${query}`;
    }

    await runPrintMode(query, options, provider);
    process.exit(0);
  }

  // ---- 交互模式（REPL）----
  console.log(`Ling Agent v${VERSION}\n`);

  const registry = createToolRegistry();
  const permConfig = loadPermissionConfig();
  const guard = new PermissionGuard(permConfig);

  // 把 ch10 的 Tool 注册表转成 Provider 统一的 Tool 格式
  const tools: Tool[] = registry.list().map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.schema,
  }));

  const messages: Message[] = [
    { role: "system", content: "You are Ling, a coding assistant." },
  ];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question("You: ", async (input) => {
      if (!input.trim()) return prompt();
      if (input.trim() === "/exit") {
        rl.close();
        return;
      }

      messages.push({ role: "user", content: input });

      let turns = 0;
      while (turns < options.maxTurns) {
        turns++;

        const response = await provider.chat(messages, tools);

        if (response.content) {
          console.log(`\nLing: ${response.content}\n`);
        }

        // 没有 tool_calls，结束循环
        if (response.toolCalls.length === 0) {
          messages.push({
            role: "assistant",
            content: response.content ?? "",
          });
          break;
        }

        // 有 tool_calls 就执行
        messages.push({
          role: "assistant",
          content: response.content ?? "",
          toolCalls: response.toolCalls,
        });

        for (const toolCall of response.toolCalls) {
          const toolName = toolCall.name;
          let args: Record<string, unknown>;
          try {
            args = JSON.parse(toolCall.arguments);
          } catch {
            const fixed = toolCall.arguments
              .replace(/float\('inf'\)/g, "null")
              .replace(/float\('nan'\)/g, "null")
              .replace(/'/g, '"');
            try {
              args = JSON.parse(fixed);
            } catch {
              const errorResult = `Error: invalid tool arguments: ${toolCall.arguments}`;
              messages.push({ role: "tool", toolCallId: toolCall.id, content: errorResult });
              continue;
            }
          }

          console.log(`\n[Tool: ${toolName}] args: ${JSON.stringify(args)}`);

          let result: string;
          const allowed = await guard.check(toolName, args);
          if (!allowed) {
            result = `[Permission denied] Tool "${toolName}" was blocked by permission guard.`;
          } else {
            try {
              result = await registry.execute(toolName, args);
            } catch (err) {
              result = `Error executing ${toolName}: ${(err as Error).message}`;
            }
          }

          console.log(`[Result] ${result.length > 200 ? result.slice(0, 200) + "..." : result}`);

          messages.push({
            role: "tool",
            toolCallId: toolCall.id,
            content: result,
          });
        }
      }

      prompt();
    });
  };
  prompt();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
