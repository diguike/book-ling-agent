// Ling Agent —— 集成会话管理和跨会话记忆
// 新增 CLI 参数：--continue / --resume <id> / --name <name> / --list-sessions

import OpenAI from "openai";
import * as readline from "readline";
import { execSync } from "child_process";
import { SessionStore, MemoryStore } from "./session/index.js";
import type { Session, Message, SessionMetadata } from "./session/index.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});
const model = process.env.LLM_MODEL || "gpt-4o";
const store = new SessionStore();

const systemPrompt = `You are Ling, a coding assistant.
When the user tells you something worth remembering (preferences, project conventions, corrections),
call the save_memory tool to persist it across sessions.`;

// ---- CLI 参数解析 ----

interface CliArgs {
  continue: boolean;       // --continue：恢复最近一次会话
  resume?: string;         // --resume <id>：恢复指定会话
  name?: string;           // --name <name>：给会话命名
  listSessions: boolean;   // --list-sessions：列出历史
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { continue: false, listSessions: false };

  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case "--continue":
      case "-c":
        args.continue = true;
        break;
      case "--resume":
      case "-r":
        args.resume = argv[++i];
        break;
      case "--name":
      case "-n":
        args.name = argv[++i];
        break;
      case "--list-sessions":
      case "-l":
        args.listSessions = true;
        break;
    }
  }
  return args;
}

// ---- 采集当前环境信息 ----

function detectMetadata(): SessionMetadata {
  let gitBranch: string | undefined;
  try {
    gitBranch = execSync("git branch --show-current", { encoding: "utf-8" }).trim();
  } catch {
    // 不在 git 仓库内，忽略
  }

  return {
    cwd: process.cwd(),
    provider: "openai",
    model,
    gitBranch,
  };
}

// ---- Memory 工具 ----

const memoryStore = new MemoryStore(process.cwd());

async function handleSaveMemory(params: {
  name: string;
  description: string;
  type: string;
  content: string;
}): Promise<string> {
  const fileName = await memoryStore.write({
    name: params.name,
    description: params.description,
    type: params.type as "user" | "project" | "feedback",
    content: params.content,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return `Memory saved: ${fileName}`;
}

const memoryTool: OpenAI.ChatCompletionTool = {
  type: "function",
  function: {
    name: "save_memory",
    description:
      "Save a piece of information that should be remembered across sessions. " +
      "Use this for user preferences, project conventions, and feedback corrections.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short title for this memory" },
        description: { type: "string", description: "One-line summary" },
        type: {
          type: "string",
          enum: ["user", "project", "feedback"],
          description: "user=preference, project=convention, feedback=correction",
        },
        content: { type: "string", description: "Full content in Markdown" },
      },
      required: ["name", "description", "type", "content"],
    },
  },
};

// ---- Agent Loop ----

async function agentLoop(userMessage: string, history: Message[]): Promise<string> {
  history.push({ role: "user", content: userMessage });

  while (true) {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "system", content: systemPrompt }, ...history],
      tools: [memoryTool],
    });

    const message = response.choices[0].message;
    history.push(message as Message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return message.content ?? "(no response)";
    }

    for (const toolCall of message.tool_calls) {
      const params = JSON.parse(toolCall.function.arguments);
      let result: string;

      if (toolCall.function.name === "save_memory") {
        result = await handleSaveMemory(params);
        console.log(`  [memory] ${result}`);
      } else {
        result = `Unknown tool: ${toolCall.function.name}`;
      }

      history.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }
  }
}

// ---- 主函数 ----

async function main() {
  const args = parseArgs(process.argv);

  // --list-sessions：打印后退出
  if (args.listSessions) {
    const sessions = await store.list();
    if (sessions.length === 0) {
      console.log("No sessions found.");
      return;
    }
    console.log("Sessions:\n");
    for (const s of sessions) {
      const date = new Date(s.updatedAt).toLocaleString();
      const label = s.name ? `"${s.name}"` : s.id.slice(0, 8);
      const preview = s.lastUserMessage ?? "(empty)";
      console.log(`  ${label}  ${s.messageCount} msgs  ${date}`);
      console.log(`    ${preview}\n`);
    }
    return;
  }

  // 决定是新建还是恢复会话
  let session: Session;

  if (args.continue) {
    const latestId = await store.getLatestId();
    if (!latestId) {
      console.log("No previous session found. Starting new session.");
      session = await store.create(detectMetadata(), args.name);
    } else {
      session = (await store.load(latestId))!;
      console.log(`Resuming session ${session.id.slice(0, 8)}... (${session.messages.length} messages)`);
    }
  } else if (args.resume) {
    const loaded = await store.load(args.resume);
    if (!loaded) {
      console.error(`Session not found: ${args.resume}`);
      process.exit(1);
    }
    session = loaded;
    console.log(`Resuming session ${session.id.slice(0, 8)}... (${session.messages.length} messages)`);
  } else {
    session = await store.create(detectMetadata(), args.name);
    console.log(`New session: ${session.id.slice(0, 8)}`);
  }

  // 加载跨会话记忆到上下文
  const memoryContext = await memoryStore.loadForContext();
  if (memoryContext) {
    // 注入为系统消息的一部分，这样 LLM 每轮都能看到
    console.log(`Loaded ${memoryContext.split("\n").length} lines of memory context.`);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("Ling Agent (ch07) — session & memory enabled\n");

  const prompt = () => {
    rl.question("You: ", async (input) => {
      if (!input.trim()) return prompt();

      try {
        const reply = await agentLoop(input, session.messages);
        console.log(`\nLing: ${reply}\n`);

        // 每轮对话后自动保存
        await store.save(session);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}\n`);
      }
      prompt();
    });
  };
  prompt();
}

main();
