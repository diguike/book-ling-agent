# 50 行代码，你的第一个 Agent

打开编辑器，新建 `ling.ts`。

这一章结束时，你会得到一个能读文件、跑命令、自主决策的 AI Agent。核心代码 50 行。名字叫 Ling（灵）。

先别急着理解"什么是 Agent"——写完代码，答案自然就有了。

## 第一步：调 LLM API

最基础的事：给 LLM 发一条消息，拿到回复。

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.LLM_API_KEY,
  baseURL: process.env.LLM_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
});
const MODEL = process.env.LLM_MODEL || "doubao-1.5-pro-32k-250115";

const res = await client.chat.completions.create({
  model: MODEL,
  messages: [{ role: "user", content: "你好" }],
});
console.log(res.choices[0].message.content);
```

这里用的是豆包（火山引擎）的 API。豆包、DeepSeek、通义千问、Moonshot——国内主流大模型全都兼容 OpenAI 的接口格式，所以我们直接用 `openai` 这个 npm 包就行。想用 Claude 就把 `baseURL` 换成 `https://api.anthropic.com/v1`，想用 OpenAI 就删掉 `baseURL`，其他代码一个字不用改。

`openai` 包本质上就是个 HTTP 客户端，往 `/chat/completions` 发 POST 请求，把响应解析成对象。没有任何魔法。

跑一下：

```bash
npm install openai
npx tsx ling.ts
```

能看到 LLM 的回复就对了。但这还不是 Agent——这只是个聊天接口。Agent 需要能**做事**。

## 第二步：给 LLM 装上"手"——read_file 工具

LLM 的训练数据截止到某个时间点，它不知道你的项目里有什么文件、代码长什么样。要让它读你的代码，就得给它一个工具。

问题来了：LLM 是个文本模型，它怎么"调用"一个函数？

答案是 **JSON Schema**。你告诉 LLM："我有一个工具叫 `read_file`，它接受一个参数 `file_path`，类型是字符串。" LLM 不会真的调用函数——它只会输出一段 JSON，说"我想调用 `read_file`，参数是 `{"file_path": "package.json"}`"。真正执行这个函数的是你的代码。

```typescript
import { readFileSync } from "fs";

type Tool = OpenAI.Chat.ChatCompletionTool;

const readFileTool: Tool = {
  type: "function",
  function: {
    name: "read_file",
    description: "Read the contents of a file at the given path",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Absolute or relative file path",
        },
      },
      required: ["file_path"],
    },
  },
};
```

几个关键点：

- `name`：工具的标识符，LLM 会在输出中引用这个名字。
- `description`：给 LLM 看的说明，写清楚这个工具干什么。这不是给人看的注释，是 LLM 决定要不要用这个工具的依据。写得模糊，LLM 就不知道什么时候该用它。
- `parameters`：标准的 JSON Schema。LLM 靠这个知道该传什么参数、什么类型。如果你的 Schema 写得不对，LLM 生成的参数就会出错。

为什么要用 JSON Schema 而不是 TypeScript 接口？因为 JSON Schema 是语言无关的标准格式。不管你用 Python、Go 还是 Rust 写 Agent，工具定义的格式都一样。OpenAI 把它选为 function calling 的参数描述格式，其他厂商全都跟进了。

执行函数很简单——就是读文件：

```typescript
function executeTool(name: string, args: Record<string, string>): string {
  if (name === "read_file") {
    return readFileSync(args.file_path, "utf-8");
  }
  return `Unknown tool: ${name}`;
}
```

## 第三步：run_command 工具

光能读文件不够。Agent 要真正有用，得能跑命令：`ls`、`git log`、`npm test`——什么都行。

```typescript
import { execSync } from "child_process";

const runCommandTool: Tool = {
  type: "function",
  function: {
    name: "run_command",
    description: "Run a shell command and return its output",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Shell command to execute",
        },
      },
      required: ["command"],
    },
  },
};
```

执行函数加一个分支：

```typescript
function executeTool(name: string, args: Record<string, string>): string {
  try {
    if (name === "read_file") return readFileSync(args.file_path, "utf-8");
    if (name === "run_command") return execSync(args.command, { encoding: "utf-8", timeout: 30000 });
    return `Unknown tool: ${name}`;
  } catch (e: any) {
    return `Error: ${e.message}`;
  }
}
```

注意 `try/catch`。文件不存在、命令执行失败，这些错误不应该让程序崩溃。把错误信息返回给 LLM，让它自己决定怎么处理——也许换个路径试试，也许换个命令。这就是 Agent 和普通脚本的区别：**Agent 能处理意外情况**。

`timeout: 30000` 也很重要。你不想让 LLM 跑一个死循环命令把你的终端卡死。

有了这两个工具，Agent 已经能做很多事了：读任意文件、列目录、看 git 历史、跑测试、查进程……任何你在终端里能做的事，它都能做。

## 第四步：Agent Loop

现在到了最关键的部分。前面都是零件，这一步把它们组装起来。

Agent Loop 的逻辑用一句话概括：**不断调 LLM，直到它不再需要工具为止**。

```typescript
type Message = OpenAI.Chat.ChatCompletionMessageParam;

async function agent(userMessage: string) {
  const messages: Message[] = [
    { role: "system", content: "You are Ling, a helpful coding assistant. Use tools to answer questions." },
    { role: "user", content: userMessage },
  ];

  while (true) {
    const res = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools,  // 把工具列表传给 LLM
    });
    const choice = res.choices[0];
    messages.push(choice.message);

    // LLM 不想用工具了，说明它觉得活干完了
    if (choice.finish_reason !== "tool_calls" || !choice.message.tool_calls) {
      console.log(choice.message.content);
      return;
    }

    // LLM 想用工具——执行它，把结果塞回消息列表
    for (const tc of choice.message.tool_calls) {
      const args = JSON.parse(tc.function.arguments);
      const result = executeTool(tc.function.name, args);
      console.log(`[tool] ${tc.function.name}(${JSON.stringify(args)}) → ${result.slice(0, 100)}...`);
      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }
}
```

整个流程是这样的：

```mermaid
flowchart TD
  A["用户发消息"] --> B["发送消息+工具列表给LLM"]
  B --> C{"LLM返回<br/>finish_reason?"}
  C -->|"tool_calls"| D["解析工具名和参数"]
  D --> E["执行工具函数"]
  E --> F["将结果以tool角色<br/>塞回messages"]
  F --> B
  C -->|"stop"| G["输出最终回复"]
```

1. 用户说了一句话（比如"读 package.json 并总结这个项目"）
2. 把用户消息连同工具列表发给 LLM
3. LLM 看看用户想干嘛，决定要不要用工具。如果要用，它会在响应里说"我想调 `read_file`，参数是 `{"file_path": "package.json"}`"
4. 我们的代码执行这个工具，拿到文件内容
5. 把执行结果以 `tool` 角色的消息塞回 `messages` 数组
6. 再次调用 LLM——这次它看到了文件内容，可能直接给出总结，也可能再调一个工具
7. 循环，直到 LLM 的 `finish_reason` 不再是 `tool_calls`

这个 `while (true)` 就是 Agent Loop。没有什么框架、没有什么设计模式——就是一个循环。

`messages` 数组是整个 Agent 的"记忆"。每次循环，LLM 的回复和工具执行结果都会追加到这个数组。LLM 每次被调用时都能看到完整的对话历史，包括之前所有的工具调用和结果。这就是为什么它能做多步推理：读了 `package.json` 之后觉得还需要看看 `src/index.ts`，于是发起第二次工具调用。

## 跑起来

最后一行：

```typescript
agent(process.argv[2] || "Read package.json and summarize this project.");
```

试一下：

```bash
export LLM_API_KEY="你的API密钥"
npx tsx ling.ts "读一下 package.json，告诉我这个项目是干嘛的"
```

终端输出大概长这样：

```
[tool] read_file({"file_path":"package.json"}) → { "name": "ling-agent-ch01", "version": "0.1.0"...
这是一个名为 ling-agent-ch01 的 Node.js 项目，版本 0.1.0。
它依赖 openai 包来调用大语言模型的 API，使用 tsx 和 typescript
作为开发工具。从结构来看，这是一个用 TypeScript 编写的 AI Agent 示例项目。
```

LLM 自己决定要读 `package.json`，读完之后自己组织语言做了总结。你没有写任何"先读文件再总结"的逻辑——这个决策是 LLM 做的。

再试一个复杂点的：

```bash
npx tsx ling.ts "这个目录下有哪些文件？挑一个最有意思的，读给我看看"
```

这次 LLM 可能会先调 `run_command` 跑 `ls`，看到文件列表之后自己选一个，再调 `read_file` 读内容。两次工具调用，两轮循环，Agent 自己编排了整个流程。

## 对照 Claude Code：真实世界的 Agent 长什么样

你可能觉得 50 行代码太简陋了。那来看看 Claude Code——Anthropic 官方的 AI 编程工具——它的核心循环是怎么写的。

Claude Code 的 Agent Loop 入口是一个 `query()` 函数，返回 `AsyncGenerator<SDKMessage>`。用 generator 是因为它需要流式输出——用户能实时看到 LLM 正在生成的内容。但逻辑本质完全一样：

```
调用 Claude API → 检查 stop_reason → 如果是 "tool_use" 就执行工具 → 结果回传 → 继续循环
```

循环终止的条件：`stop_reason === "end_turn"` 或者达到 `max_turns` 上限。`max_turns` 是个安全阀——你不想让 Agent 无限循环下去。我们的代码其实也应该加这个，后面的章节会补上。

真正的区别在规模。我们定义了 2 个工具，Claude Code 定义了 **29 个**。包括：

- `Read`：读文件。跟我们的 `read_file` 一样，但支持 `offset` 和 `limit` 参数，能只读文件的一部分——处理大文件时不会把整个文件塞进上下文。
- `Edit`：编辑文件。不是整个覆盖，而是精确替换指定的文本片段。
- `Bash`：跑命令。跟我们的 `run_command` 类似，但有超时控制、沙箱机制、输出截断。
- `Grep`：搜索代码。单独做了一个工具而不是用 `Bash` 跑 `grep`，因为可以针对性地优化搜索体验。
- `Write`：写文件。
- `Glob`：按模式匹配查找文件。

每个工具都有严格的 TypeScript 接口定义：

```typescript
interface FileReadInput {
  file_path: string;
  offset?: number;
  limit?: number;
}
```

工具执行结果也有统一的输出类型——不是裸字符串，而是结构化的对象，包含内容、状态、错误信息。这样上层逻辑可以统一处理成功和失败的情况，不用每个工具单独写错误处理。

但你把这些细节全剥掉，Claude Code 的核心依然是：

```
while (stop_reason === "tool_use") {
  执行工具 → 结果回传 → 再调一次 LLM
}
```

跟你刚写的那个 `while (true)` 循环，一模一样。

29 个工具 vs 2 个工具，流式输出 vs 一次性输出，生产级错误处理 vs 简单 try/catch——这些都是工程细节。Agent 的骨架不变。

## 完整代码

把前面的代码整理到一起，完整的 `ling.ts`：

```typescript
import OpenAI from "openai";
import { readFileSync } from "fs";
import { execSync } from "child_process";

type Tool = OpenAI.Chat.ChatCompletionTool;
type Message = OpenAI.Chat.ChatCompletionMessageParam;

const client = new OpenAI({
  apiKey: process.env.LLM_API_KEY,
  baseURL: process.env.LLM_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
});
const MODEL = process.env.LLM_MODEL || "doubao-1.5-pro-32k-250115";

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

async function agent(userMessage: string) {
  const messages: Message[] = [
    { role: "system", content: "You are Ling, a helpful coding assistant. Use tools to answer questions." },
    { role: "user", content: userMessage },
  ];

  while (true) {
    const res = await client.chat.completions.create({ model: MODEL, messages, tools });
    const choice = res.choices[0];
    messages.push(choice.message);

    if (choice.finish_reason !== "tool_calls" || !choice.message.tool_calls) {
      console.log(choice.message.content);
      return;
    }

    for (const tc of choice.message.tool_calls) {
      const args = JSON.parse(tc.function.arguments);
      const result = executeTool(tc.function.name, args);
      console.log(`[tool] ${tc.function.name}(${JSON.stringify(args)}) → ${result.slice(0, 100)}...`);
      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }
}

agent(process.argv[2] || "Read package.json and summarize this project.");
```

去掉 import 和类型定义，核心代码确实在 50 行以内。

## Agent = LLM + Tools + Loop

回头看这 50 行代码，Agent 就三个东西：

**LLM**：负责思考和决策。看到用户请求，决定用什么工具、传什么参数。看到工具返回的结果，决定是继续用工具还是直接回答。所有"智能"都在这里。

**Tools**：Agent 的"手脚"。LLM 只能生成文本，工具让它能跟真实世界交互——读文件、跑命令、调 API、写数据库。工具越多，Agent 能做的事越多。工具的 JSON Schema 描述越精确，LLM 使用工具时出错越少。

**Loop**：把 LLM 和 Tools 串起来的循环。没有这个循环，LLM 调一次工具就结束了，做不了多步任务。有了循环，LLM 可以"先查目录结构，再读关键文件，最后给出总结"——自己规划、自己执行、自己判断什么时候收工。

市面上所有的 Agent 框架——LangChain、CrewAI、AutoGen——不管包装了多少概念，核心都是这三样。区别在于：工具多不多、Loop 复不复杂、上下文管理得好不好。

下一章给 Ling 加上多模型支持——一套代码跑通火山引擎、Claude、OpenAI 三家 LLM。
