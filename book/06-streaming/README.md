# 流式交互——边想边说的用户体验

上一章我们给 Ling 装上了权限系统，现在它不会乱删文件了。但用起来有个很大的问题：你发了一条消息，然后盯着空白屏幕等 10 秒、20 秒、甚至 30 秒，突然"啪"一大段文字出现。

这种体验很糟。

你去问 ChatGPT 一个问题，它是逐字"打"出来的。你用 Claude Code，它也是一边思考一边输出。这不是花哨的动画效果——它从根本上改变了用户对"等待"的感知。心理学上叫 **Time-to-First-Token（TTFT）**：用户看到第一个字的延迟。批量模式的 TTFT 等于整个请求的完成时间；流式模式的 TTFT 通常在 200-500ms，快了 10 倍以上。

同样等 15 秒出完结果，流式模式下用户在第 0.3 秒就开始阅读了，体感上几乎没有等待。

这章把 Ling 从"想完再说"升级到"边想边说"。

## 6.1 三家 LLM 的流式协议

所有主流 LLM 的流式接口都基于 SSE（Server-Sent Events）——服务端通过 HTTP 持续推送数据，每条数据以 `data: ` 开头。但具体格式各家不同。

### OpenAI / 火山引擎

OpenAI 的格式最简单直接。文本内容在 `delta.content` 里，工具调用在 `delta.tool_calls` 里：

```
data: {"choices":[{"delta":{"content":"Hello"}}]}
data: {"choices":[{"delta":{"content":" world"}}]}
data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_abc","function":{"name":"grep","arguments":""}}]}}]}
data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"pat"}}]}}]}
data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"tern\":"}}]}}]}
data: {"choices":[{"finish_reason":"tool_calls"}]}
```

注意工具调用的参数是碎片化的——`{"pat` 和 `tern":` 是两个独立的 chunk，你需要自己拼接。火山引擎（豆包）完全兼容 OpenAI 协议，只是 baseURL 不同。

### Claude

Claude 的 SSE 格式更结构化，用事件类型区分不同阶段：

```
event: message_start
data: {"type":"message_start","message":{"id":"msg_xxx",...}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_xxx","name":"grep","input":{}}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"pattern\":"}}

event: content_block_stop
data: {"type":"content_block_stop","index":1}

event: message_stop
data: {"type":"message_stop"}
```

主要差异：
- OpenAI 用 `delta` 字段区分内容类型，Claude 用 `event` 类型 + `content_block` 类型双层区分
- Claude 有明确的 `content_block_start` / `content_block_stop` 边界，OpenAI 靠 `id` 字段出现来标记开始
- Claude 的工具参数字段叫 `partial_json`，OpenAI 叫 `arguments`

```mermaid
sequenceDiagram
  participant User as 用户终端
  participant Loop as Agent Loop
  participant Provider as LLM Provider
  participant LLM as LLM API (SSE)
  participant Tool as 工具系统

  User->>Loop: 用户输入
  Loop->>Provider: stream(messages, tools)
  Provider->>LLM: HTTP请求 (stream:true)
  LLM-->>Provider: text chunk
  Provider-->>Loop: StreamChunk(text)
  Loop-->>User: 逐字渲染到终端
  LLM-->>Provider: tool_call chunks
  Provider-->>Loop: StreamChunk(tool_call_start/delta/end)
  Loop->>Loop: ToolCallCollector 拼装完整调用
  Loop->>Tool: 执行工具(带Spinner)
  Tool-->>Loop: 工具结果
  Loop->>Provider: stream(messages+结果, tools)
  LLM-->>Provider: text chunks
  Provider-->>Loop: StreamChunk(text)
  Loop-->>User: 逐字渲染最终回复
```

### 统一抽象：StreamChunk

每家协议都自己解析一遍太累了。我们定义一套统一的 `StreamChunk` 类型，各家 Provider 负责把自己的格式转成这个：

```typescript
// src/streaming/types.ts

export type StreamChunkType =
  | "text"             // 普通文本 token
  | "tool_call_start"  // 工具调用开始（携带工具名和 id）
  | "tool_call_delta"  // 工具调用参数的增量片段
  | "tool_call_end"    // 工具调用结束
  | "finish";          // 整个响应结束

export interface StreamChunk {
  type: StreamChunkType;
  content: string;
  toolCallId?: string;        // 工具调用的唯一 ID
  toolName?: string;          // 仅在 tool_call_start 时出现
  index?: number;             // 同一响应中第几个工具调用
}

export interface CollectedToolCall {
  id: string;
  name: string;
  arguments: string;          // 完整的 JSON 字符串
}
```

五种事件类型覆盖了所有场景。`text` 是常规输出，`tool_call_start/delta/end` 是工具调用的生命周期，`finish` 标记响应结束。不管底层是 OpenAI、Claude 还是火山引擎，上层代码只看 `StreamChunk`。

## 6.2 扩展 Provider 接口

在第二章的 `LLMProvider` 接口基础上加一个 `stream()` 方法：

```typescript
// src/providers/types.ts

export interface LLMProvider {
  name: string;

  /** 非流式调用（保留兼容） */
  chat(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse>;

  /** 流式调用——返回异步迭代器 */
  stream(
    messages: Message[],
    tools?: ToolDefinition[]
  ): AsyncIterable<StreamChunk>;
}
```

关键设计：`stream()` 返回 `AsyncIterable<StreamChunk>`。这意味着消费端可以用 `for await...of` 逐个处理 chunk，代码写起来跟同步遍历数组一样自然：

```typescript
for await (const chunk of provider.stream(messages, tools)) {
  // 每收到一个 chunk 就处理一次
}
```

保留 `chat()` 方法是因为有些场景不需要流式——比如自动化脚本，或者你想简化调试。两个方法共存，按需选用。

## 6.3 OpenAI 流式实现

OpenAI 的 SDK 原生支持流式，加 `stream: true` 参数就行：

```typescript
// src/providers/openai.ts（流式部分）

async *stream(
  messages: Message[],
  tools?: ToolDefinition[]
): AsyncIterable<StreamChunk> {
  const stream = await this.client.chat.completions.create({
    model: this.model,
    messages: messages as OpenAI.ChatCompletionMessageParam[],
    tools: tools?.length ? tools as OpenAI.ChatCompletionTool[] : undefined,
    stream: true,
  });

  for await (const event of stream) {
    const delta = event.choices[0]?.delta;
    if (!delta) continue;

    // 文本内容
    if (delta.content) {
      yield { type: "text", content: delta.content };
    }

    // 工具调用
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        if (tc.id) {
          // 新的工具调用开始（id 只在第一个 chunk 出现）
          yield {
            type: "tool_call_start",
            content: "",
            toolCallId: tc.id,
            toolName: tc.function?.name,
            index: tc.index,
          };
        }
        if (tc.function?.arguments) {
          yield {
            type: "tool_call_delta",
            content: tc.function.arguments,
            index: tc.index,
          };
        }
      }
    }

    // 结束信号
    if (event.choices[0]?.finish_reason) {
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          yield { type: "tool_call_end", content: "", index: tc.index };
        }
      }
      yield { type: "finish", content: "" };
    }
  }
}
```

`async *` 是 JavaScript 的异步生成器语法。每次 `yield` 一个 `StreamChunk`，消费端的 `for await` 就会收到。这比回调或事件监听写起来清晰得多。

火山引擎因为完全兼容 OpenAI 协议，直接复用就行：

```typescript
// src/providers/volcano.ts

import { OpenAIProvider } from "./openai.js";

export function createVolcanoProvider(model?: string): OpenAIProvider {
  return new OpenAIProvider({
    model: model ?? "doubao-pro-32k",
    apiKey: process.env.VOLCANO_API_KEY,
    baseURL: "https://ark.cn-beijing.volces.com/api/v3",
  });
}
```

## 6.4 Claude 流式实现

Claude 没有官方的 Node.js 流式 SDK（有，但为了展示原理我们手动解析），所以需要自己处理 SSE：

```typescript
// src/providers/claude.ts（流式部分）

async *stream(
  messages: Message[],
  tools?: ToolDefinition[]
): AsyncIterable<StreamChunk> {
  const { system, messages: claudeMessages } = toClaudeMessages(messages);

  const body: Record<string, unknown> = {
    model: this.model,
    max_tokens: this.maxTokens,
    stream: true,
    system,
    messages: claudeMessages,
  };
  if (tools?.length) {
    body.tools = toClaudeTools(tools);
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": this.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentToolIndex = 0;
  let currentToolId = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === "[DONE]") continue;

      let event: Record<string, any>;
      try { event = JSON.parse(raw); } catch { continue; }

      switch (event.type) {
        case "content_block_start": {
          const block = event.content_block;
          if (block.type === "tool_use") {
            currentToolId = block.id;
            yield {
              type: "tool_call_start",
              content: "",
              toolCallId: block.id,
              toolName: block.name,
              index: currentToolIndex,
            };
          }
          break;
        }
        case "content_block_delta": {
          const delta = event.delta;
          if (delta.type === "text_delta") {
            yield { type: "text", content: delta.text };
          } else if (delta.type === "input_json_delta") {
            yield {
              type: "tool_call_delta",
              content: delta.partial_json,
              index: currentToolIndex,
            };
          }
          break;
        }
        case "content_block_stop": {
          if (currentToolId) {
            yield { type: "tool_call_end", content: "", index: currentToolIndex };
            currentToolIndex++;
            currentToolId = "";
          }
          break;
        }
        case "message_stop": {
          yield { type: "finish", content: "" };
          break;
        }
      }
    }
  }
}
```

核心逻辑是一个 SSE 手动解析器：从 `ReadableStream` 逐块读取字节，按 `\n` 切行，找 `data:` 前缀，解析 JSON，根据 `type` 字段分发到不同的 `yield`。

注意 `buffer` 变量的作用——TCP 传输不保证按行切割，一次 `read()` 可能读到半行数据。`buffer` 暂存不完整的行，等下次 `read()` 拼上后面的数据再处理。这是解析 SSE 的标准套路。

## 6.5 终端渲染

流式数据到手了，怎么显示？直接 `console.log` 会每个 token 换一行，没法看。我们需要一个渲染器，处理三件事：

1. **逐字输出文本**——用 `process.stdout.write()` 而非 `console.log()`
2. **工具调用中间态**——用户看到 LLM 想调什么工具
3. **执行中的 spinner 动画**——工具跑起来后有个转圈提示

### ANSI escape codes

终端里的颜色、加粗、光标控制，都靠 ANSI escape codes。很多人用 `chalk` 库来做，但为了一个颜色引入一个依赖没必要。自己写几个常量就够了：

```typescript
const RESET   = "\x1b[0m";
const BOLD    = "\x1b[1m";
const DIM     = "\x1b[2m";
const CYAN    = "\x1b[36m";
const GREEN   = "\x1b[32m";
const YELLOW  = "\x1b[33m";
```

`\x1b[` 是 ESC 序列的开头，后面的数字是控制码。`0m` 重置，`1m` 加粗，`36m` 青色。用的时候：

```typescript
process.stdout.write(`${BOLD}${CYAN}Ling:${RESET} `);
// 输出加粗青色的 "Ling:"，然后重置样式
```

### Spinner

工具执行需要时间（比如跑一个 grep），用户需要知道"程序还活着"。一个旋转的小图标就够了：

```typescript
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class Spinner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private frameIdx = 0;
  private label = "";

  start(label: string): void {
    this.stop();
    this.label = label;
    this.frameIdx = 0;

    this.timer = setInterval(() => {
      const frame = SPINNER_FRAMES[this.frameIdx % SPINNER_FRAMES.length];
      // \r 回到行首，\x1b[K 清除到行尾
      process.stderr.write(`\r${DIM}${frame} ${this.label}${RESET}\x1b[K`);
      this.frameIdx++;
    }, 80);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      process.stderr.write("\r\x1b[K");
    }
  }
}
```

两个关键技巧：

- `\r`（回车）让光标回到行首，配合 `\x1b[K`（清除到行尾），实现同一行原地更新
- 输出到 `stderr` 而不是 `stdout`——这样 spinner 不会混进 LLM 的正文输出。如果用户用管道 `ling | tee log.txt`，日志文件里只有干净的文本，不会有满屏的 spinner 帧

### 完整渲染器

```typescript
// src/streaming/renderer.ts

export class StreamRenderer {
  private spinner = new Spinner();
  private hasOutput = false;

  onChunk(chunk: StreamChunk): void {
    switch (chunk.type) {
      case "text":
        this.renderText(chunk.content);
        break;
      case "tool_call_start":
        this.renderToolStart(chunk.toolName ?? "unknown", chunk.toolCallId);
        break;
      case "tool_call_delta":
        break; // 参数碎片不展示
      case "tool_call_end":
        break; // 等实际执行时再显示
      case "finish":
        this.renderFinish();
        break;
    }
  }

  private renderText(text: string): void {
    if (!this.hasOutput) {
      process.stdout.write(`\n${BOLD}${CYAN}Ling:${RESET} `);
      this.hasOutput = true;
    }
    process.stdout.write(text);
  }

  private renderToolStart(name: string, id?: string): void {
    if (this.hasOutput) {
      process.stdout.write("\n");
      this.hasOutput = false;
    }
    const icon = toolIcon(name);
    process.stderr.write(`\n${DIM}  ${icon} ${name}${RESET}\n`);
  }

  startToolExecution(name: string, summary: string): void {
    this.spinner.start(`${toolIcon(name)} ${name}: ${summary}`);
  }

  stopToolExecution(name: string, success: boolean): void {
    this.spinner.stop();
    const status = success ? `${GREEN}✓${RESET}` : `${YELLOW}✗${RESET}`;
    process.stderr.write(`  ${toolIcon(name)} ${name} ${status}\n`);
  }
}
```

`onChunk` 在流式循环里被每个 chunk 调用。`startToolExecution` / `stopToolExecution` 在工具实际执行前后调用。分两层是因为流式接收和工具执行是不同阶段——先收完所有 chunk 知道要调什么工具，然后才开始执行。

## 6.6 工具调用碎片收集

流式 API 把一次工具调用的 JSON 参数拆成 N 个小片段发过来。比如 `{"pattern": "TODO", "path": "src"}` 可能被拆成 `{"pat`、`tern": "TO`、`DO", "pa`、`th": "src"}`。

Collector 负责把这些碎片拼回完整的调用：

```typescript
// src/streaming/collector.ts

export class ToolCallCollector {
  private pending = new Map<
    number,
    { id: string; name: string; argChunks: string[] }
  >();
  private completed: CollectedToolCall[] = [];

  feed(chunk: StreamChunk): boolean {
    const idx = chunk.index ?? 0;

    switch (chunk.type) {
      case "tool_call_start": {
        this.pending.set(idx, {
          id: chunk.toolCallId ?? `call_${idx}`,
          name: chunk.toolName ?? "unknown",
          argChunks: [],
        });
        return false;
      }
      case "tool_call_delta": {
        const entry = this.pending.get(idx);
        if (entry) {
          entry.argChunks.push(chunk.content);
        }
        return false;
      }
      case "tool_call_end": {
        const entry = this.pending.get(idx);
        if (entry) {
          this.completed.push({
            id: entry.id,
            name: entry.name,
            arguments: entry.argChunks.join(""),
          });
          this.pending.delete(idx);
          return true; // 有新的完整调用
        }
        return false;
      }
      default:
        return false;
    }
  }

  drain(): CollectedToolCall[] {
    const result = [...this.completed];
    this.completed = [];
    return result;
  }
}
```

`pending` 按 `index`（同一响应中第几个工具调用）暂存正在收集的碎片。`tool_call_end` 到来时把碎片 join 成完整 JSON，放进 `completed` 队列。`drain()` 取出所有完成的调用。

为什么用 `index` 做 key？因为 LLM 可能在一次响应中并行发起多个工具调用（比如同时 grep 两个文件），它们的参数碎片会交替出现。`index` 确保不会拼串。

## 6.7 流式 Agent Loop

所有组件就位，把它们串进 Agent Loop：

```typescript
// src/ling.ts

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
      renderer.onChunk(chunk);          // 实时渲染

      if (chunk.type === "text") {
        fullText += chunk.content;      // 收集完整文本
      }

      collector.feed(chunk);            // 收集工具调用碎片
    }

    // ---- 判断下一步 ----
    const toolCalls = collector.drain();

    if (toolCalls.length === 0) {
      // 纯文本回复，结束
      history.push({ role: "assistant", content: fullText || "(no response)" });
      return;
    }

    // 有工具调用——记录到历史
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
          content: "Error: invalid JSON in tool arguments",
        });
        continue;
      }

      // 权限检查（复用 ch05）
      const allowed = await guard.check(name, params);
      if (!allowed) {
        history.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: "Permission denied.",
        });
        continue;
      }

      // 带 spinner 执行
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
    // while(true) 继续——LLM 看到工具结果后决定下一步
  }
}
```

跟第五章的 batch 版对比，核心变化就两处：

1. `client.chat.completions.create()` 变成 `provider.stream()`，返回值从一个完整对象变成 chunk 流
2. 新增 `ToolCallCollector` 来拼装工具调用——batch 模式下 SDK 直接给你完整的 `tool_calls` 数组，流式模式需要自己收集

其他逻辑（权限检查、工具执行、历史记录、while 循环）完全不变。这就是抽象层做对了的好处——底层通信方式变了，上层业务逻辑几乎不动。

## 6.8 对照 Claude Code 的消息架构

我们的 `StreamChunk` 只有 5 种类型，够用但粗糙。看看 Claude Code 是怎么做的——它定义了 **24 种消息类型**。

为什么需要这么多？因为 Claude Code 不只是一个终端工具，它的输出需要被多种消费者使用：

**面向 SDK 的消息（程序消费）：**
- `SDKAssistantMessage` — 完整的 assistant 回复（非流式）
- `SDKPartialAssistantMessage` — 流式中间态，每个 token 更新一次
- `SDKToolProgressMessage` — 工具执行的进度更新
- `SDKToolResultMessage` — 工具执行完毕的结果
- `SDKResultMessage` — 整个请求的最终结果，包含 cost、token 统计、duration

**面向 UI 的消息（人看的）：**
- `SDKPermissionRequest` — 权限确认请求
- `SDKPermissionResponse` — 用户的确认结果
- `SDKProgressMessage` — 通用进度提示

**`--output-format stream-json` 模式：**

Claude Code 支持 `--output-format stream-json`，每行输出一个 JSON 对象，方便程序解析：

```jsonl
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Let me "}]},"session_id":"abc"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Let me look"}]},"session_id":"abc"}
{"type":"tool","tool_name":"Read","content":"file contents..."}
{"type":"result","cost":0.003,"duration_ms":1200,"tokens":{"input":500,"output":150}}
```

注意 `SDKPartialAssistantMessage`——它不是增量 delta，而是每次发送**到目前为止的完整内容**。第一条是 `"Let me "`，第二条是 `"Let me look"`。这种设计对 UI 更友好：渲染端不需要维护状态拼接碎片，直接用最新的消息替换上一条就行。代价是带宽稍大，但在本地进程间通信的场景下不是问题。

`includePartialMessages` 选项也值得一提。默认关闭，只输出完整消息；打开后才会输出 `SDKPartialAssistantMessage` 这样的中间态。这让消费者自己选择要不要处理流式更新——做 CLI 管道的时候关掉省事，做 IDE 集成的时候打开获取实时反馈。

`SDKResultMessage` 包含的统计信息也很实用：

```typescript
interface SDKResultMessage {
  type: "result";
  cost: number;           // 美元
  duration_ms: number;
  tokens: {
    input: number;
    output: number;
    cache_read?: number;  // prompt cache 命中
    cache_write?: number;
  };
  is_error: boolean;
  session_id: string;
}
```

这些信息对成本监控、性能优化都是刚需。我们的 Ling 暂时没加，但如果你要做生产级工具，`ResultMessage` 是必须的。

## 6.9 小结

这章做了三件事：

1. **统一流式抽象**——`StreamChunk` 五种类型，屏蔽 OpenAI / Claude / 火山引擎的协议差异
2. **终端渲染**——逐字输出、ANSI 颜色、spinner、工具中间态，不依赖第三方库
3. **流式 Agent Loop**——`ToolCallCollector` 拼装碎片，`StreamRenderer` 实时渲染，权限和工具系统原封不动

从用户体验看，变化是巨大的：TTFT 从 10+ 秒降到 0.3 秒，工具执行有 spinner 提示，整个交互从"等结果"变成了"看 Agent 思考"。

从代码结构看，变化很小：`stream()` 方法和 `chat()` 方法并存，Agent Loop 的核心逻辑（while 循环、工具执行、历史管理）几乎没改。好的抽象就是这样——底层实现大改，上层接口小动。

下一章加上会话记忆——让 Ling 记住之前聊了什么，跨会话保持上下文。
