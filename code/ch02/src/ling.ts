import { readFileSync } from "fs";
import { execSync } from "child_process";
import type { Message, Tool, ProviderConfig } from "./providers/index.js";
import { initProvider } from "./providers/index.js";

// ===== 工具定义 =====
// 和 ch01 一样的两个工具，但现在用我们自己的 Tool 类型

const tools: Tool[] = [
  {
    name: "read_file",
    description: "Read the contents of a file at the given path",
    parameters: {
      type: "object",
      properties: { file_path: { type: "string", description: "Absolute or relative file path" } },
      required: ["file_path"],
    },
  },
  {
    name: "run_command",
    description: "Run a shell command and return its output",
    parameters: {
      type: "object",
      properties: { command: { type: "string", description: "Shell command to execute" } },
      required: ["command"],
    },
  },
];

function executeTool(name: string, args: Record<string, string>): string {
  try {
    if (name === "read_file") return readFileSync(args.file_path, "utf-8");
    if (name === "run_command") return execSync(args.command, { encoding: "utf-8", timeout: 30000 });
    return `Unknown tool: ${name}`;
  } catch (e: any) {
    return `Error: ${e.message}`;
  }
}

// ===== 解析命令行参数 =====

function parseArgs(): { query: string; config: Partial<ProviderConfig> } {
  const args = process.argv.slice(2);
  const config: Partial<ProviderConfig> = {};
  let query = "";

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--provider":
      case "-p":
        config.provider = args[++i] as ProviderConfig["provider"];
        break;
      case "--model":
      case "-m":
        config.model = args[++i];
        break;
      default:
        query = args[i];
    }
  }

  return { query: query || "Read package.json and summarize this project.", config };
}

// ===== Agent 主循环 =====

async function agent(query: string, config: Partial<ProviderConfig>) {
  const provider = initProvider(config);

  const messages: Message[] = [
    { role: "system", content: "You are Ling, a helpful coding assistant. Use tools to answer questions." },
    { role: "user", content: query },
  ];

  const MAX_TURNS = 20;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await provider.chat(messages, tools);

    // 把 assistant 消息存入历史
    messages.push({
      role: "assistant",
      content: res.content || "",
      toolCalls: res.toolCalls.length > 0 ? res.toolCalls : undefined,
    });

    // 没有工具调用，输出结果，结束
    if (res.finishReason !== "tool_calls" || res.toolCalls.length === 0) {
      console.log(res.content);
      return;
    }

    // 执行工具
    for (const tc of res.toolCalls) {
      const args = JSON.parse(tc.arguments);
      const result = executeTool(tc.name, args);
      console.log(`[tool] ${tc.name}(${JSON.stringify(args)}) -> ${result.slice(0, 100)}...`);
      messages.push({ role: "tool", toolCallId: tc.id, content: result });
    }
  }

  console.log("[ling] Reached max turns, stopping.");
}

// ===== 入口 =====

const { query, config } = parseArgs();
agent(query, config);
