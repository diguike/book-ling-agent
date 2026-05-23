// Ling Agent — 集成上下文引擎
// ch04: System Prompt 分层 + 项目感知 + .ling.md + 长对话压缩

import OpenAI from "openai";
import { readFileSync } from "fs";
import { execSync } from "child_process";
import { createInterface } from "readline";
import { buildSystemPrompt, calculateBudget, estimateTokens, Compactor } from "./context/index.js";

type Tool = OpenAI.Chat.ChatCompletionTool;
type Message = OpenAI.Chat.ChatCompletionMessageParam;

const client = new OpenAI({
  apiKey: process.env.LLM_API_KEY,
  baseURL: process.env.LLM_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
});
const MODEL = process.env.LLM_MODEL || "doubao-1.5-pro-32k-250115";
const CONTEXT_WINDOW = parseInt(process.env.CONTEXT_WINDOW || "32000", 10);

// ===== 工具定义 =====

const tools: Tool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file at the given path",
      parameters: {
        type: "object",
        properties: { file_path: { type: "string", description: "Absolute or relative file path" } },
        required: ["file_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run a shell command and return its output",
      parameters: {
        type: "object",
        properties: { command: { type: "string", description: "Shell command to execute" } },
        required: ["command"],
      },
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

// ===== 上下文引擎初始化 =====

const cwd = process.cwd();
const systemPrompt = buildSystemPrompt({ cwd });
const compactor = new Compactor(client, MODEL, { keepRecentTurns: 4, maxHistoryTokens: 50000 });

// 启动时打印预算信息
const toolDefs = JSON.stringify(tools);
const budget = calculateBudget(CONTEXT_WINDOW, systemPrompt, toolDefs, "");
console.log(`[ling] Project detected. System prompt: ${budget.systemPrompt} tokens`);
console.log(`[ling] Budget: ${budget.available} tokens available (${budget.reserved} reserved for tool results)`);

// ===== Agent 主循环 =====

let messages: Message[] = [{ role: "system", content: systemPrompt }];

async function handleTurn(userMessage: string) {
  // /compact 命令：手动触发压缩
  if (userMessage.trim() === "/compact") {
    messages = await compactor.compact(messages);
    console.log("[ling] Conversation compacted.");
    return;
  }

  messages.push({ role: "user", content: userMessage });

  // 自动压缩检查
  if (compactor.shouldCompact(messages)) {
    console.log("[ling] Context getting large, auto-compacting...");
    messages = await compactor.compact(messages);
  }

  const MAX_TURNS = 20;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await client.chat.completions.create({ model: MODEL, messages, tools });
    const choice = res.choices[0];
    messages.push(choice.message);

    if (choice.finish_reason !== "tool_calls" || !choice.message.tool_calls) {
      console.log(`\n${choice.message.content}\n`);
      return;
    }

    for (const tc of choice.message.tool_calls) {
      const args = JSON.parse(tc.function.arguments);
      const result = executeTool(tc.function.name, args);
      console.log(`[tool] ${tc.function.name}(${JSON.stringify(args)}) → ${result.slice(0, 100)}...`);
      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }

  console.log("[ling] Reached max turns, stopping.");
}

// ===== REPL =====

const rl = createInterface({ input: process.stdin, output: process.stdout });

function prompt() {
  const historyTokens = estimateTokens(JSON.stringify(messages));
  rl.question(`[${historyTokens} tokens] > `, async (input) => {
    const trimmed = input.trim();
    if (!trimmed || trimmed === "/quit") {
      rl.close();
      return;
    }
    await handleTurn(trimmed);
    prompt();
  });
}

console.log("[ling] Ready. Type /compact to compress history, /quit to exit.\n");
prompt();
