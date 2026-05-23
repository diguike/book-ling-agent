# 附录 D · Claude Code 源码导航

Claude Code 是本书的主要参考对象。这份导航帮你在它的源码中快速定位核心模块。

说明：Claude Code 的源码通过 npm 包 `@anthropic-ai/claude-code` 分发，安装后可在 `node_modules/@anthropic-ai/claude-code` 中查看。源码经过编译但结构清晰，模块边界明确。

---

## D.1 核心模块与功能对照

| Claude Code 模块 | 功能 | Ling 对应 |
|------------------|------|-----------|
| `cli/main` | CLI 入口，参数解析，启动流程 | `cli/parser.ts` |
| `core/agent` | Agent 主循环：发请求 → 解析 → 工具执行 → 循环 | `ling.ts` |
| `core/provider` | LLM Provider 抽象与适配 | `providers/*.ts` |
| `tools/*` | 29 个内置工具的实现 | `tools/*.ts`（8 个） |
| `permissions/` | 权限系统：规则匹配 + 用户确认 + auto 模式 | `permissions/*.ts` |
| `context/system-prompt` | System prompt 组装 | `context/system-prompt.ts` |
| `context/project` | 项目检测与信息提取 | `context/project-detector.ts` |
| `context/compactor` | 上下文压缩（超 token 预算时摘要） | `context/compactor.ts` |
| `session/` | 会话持久化与恢复 | `session/*.ts` |
| `hooks/` | Hook 引擎：PreToolUse / PostToolUse 等 | `hooks/*.ts` |
| `mcp/` | MCP 客户端实现 | `mcp/*.ts` |
| `agents/` | Sub-Agent 生成与调度 | `agents/*.ts` |
| `streaming/` | 流式输出处理 | `streaming/*.ts` |
| `skills/` | Skill 系统（Markdown 驱动工作流） | 未实现 |
| `config/` | 6 层配置分层加载与合并 | `permissions/config.ts`（简化版） |
| `lsp/` | Language Server Protocol 集成 | 未实现 |
| `worktree/` | Git worktree 生命周期管理 | 未实现 |

---

## D.2 关键类型定义

以下是阅读源码时会高频遇到的类型。理解这些类型等于理解了 Claude Code 的数据流。

### ToolInputSchemas

每个工具的参数定义，基于 JSON Schema：

```typescript
// 工具定义的核心结构
interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
  // Claude Code 特有：工具的权限声明
  isReadOnly?: boolean;
  needsPermission?: boolean;
  permissionDescription?: string;
}
```

Ling 中对应 `tools/types.ts` 的 `Tool` 接口。Claude Code 多了权限相关的字段。

### SDKMessage / Message

消息是 Agent Loop 的核心数据结构：

```typescript
// 简化版，突出关键字段
type MessageRole = "user" | "assistant";

interface TextBlock {
  type: "text";
  text: string;
}

interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | ContentBlock[];
  is_error?: boolean;
}

type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

interface Message {
  role: MessageRole;
  content: ContentBlock[];
}
```

Claude Code 直接使用 Anthropic SDK 的消息格式（content 是数组）。Ling 在 Provider 层做了转换，内部统一使用 OpenAI 格式。

### PermissionMode

权限系统的三种运行模式：

```typescript
type PermissionMode =
  | "default"     // 危险操作弹确认框
  | "plan"        // 只允许只读操作，不执行任何写入
  | "auto";       // 用分类器自动判断是否放行
```

Ling 实现了 `default` 模式的核心逻辑。`plan` 模式可以简单实现（只注册只读工具），`auto` 模式需要额外的分类模型。

### ConfigSources（6 层配置）

```typescript
// 配置加载优先级，从高到低
enum ConfigSource {
  Managed,      // 企业管理员锁定的配置（不可覆盖）
  Enterprise,   // 企业级默认配置
  CLIFlags,     // 命令行参数 --provider、--model 等
  ProjectLocal, // .claude/settings.local.json（不进 git）
  ProjectShared,// .claude/settings.json（进 git，团队共享）
  User,         // ~/.claude/settings.json（用户全局）
  Default       // 代码内置的默认值
}
```

每一层可以设置 `allow`、`deny`、`override` 规则。高优先级的 `deny` 不可被低优先级的 `allow` 覆盖。这种分层在企业环境中很重要——安全团队可以通过 Managed 层禁止某些危险操作，开发者无法绕过。

### HookEvent

```typescript
interface HookEvent {
  type: "PreToolUse" | "PostToolUse" | "Notification" | "Stop";
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_output?: string;
  // Hook handler 的返回值
  decision?: "approve" | "deny" | "continue";
  reason?: string;
}
```

与 Ling 的 Hook 类型基本一致。Claude Code 多了 `Notification` 和 `Stop` 两种事件，以及 handler 可以返回 `decision` 来影响工具执行。

---

## D.3 29 个内置工具清单

Claude Code 的工具经过大量实战打磨，每个工具的参数设计都有讲究。

| 工具名 | 类别 | 功能 | Ling 有无 |
|--------|------|------|-----------|
| Read | 文件 | 读文件（支持行号范围、图片、PDF） | 有（read-file） |
| Write | 文件 | 写文件（整文件） | 有（write-file） |
| Edit | 文件 | 精确字符串替换 | 有（edit-file） |
| MultiEdit | 文件 | 单次多处替换 | 无 |
| Bash | 执行 | 运行 shell 命令 | 有（bash） |
| Glob | 搜索 | 文件名模式匹配 | 有（glob） |
| Grep | 搜索 | 内容正则搜索 | 有（grep） |
| LS | 文件 | 列目录 | 有（list-files） |
| TodoRead | 任务 | 读取任务列表 | 无 |
| TodoWrite | 任务 | 管理任务列表 | 无 |
| WebFetch | 网络 | 获取网页内容 | 无 |
| WebSearch | 网络 | 搜索引擎查询 | 无 |
| NotebookEdit | 开发 | 编辑 Jupyter Notebook | 无 |
| NotebookRead | 开发 | 读取 Notebook | 无 |
| Agent | 多Agent | 启动子 Agent 执行任务 | 有（agents/spawner） |
| Skill | 扩展 | 调用 Skill 工作流 | 无 |
| ToolSearch | 扩展 | 搜索可用工具（含 MCP） | 无 |
| TaskCreate | 任务 | 创建后台任务 | 无 |
| TaskGet | 任务 | 查询任务状态 | 无 |
| TaskList | 任务 | 列出所有任务 | 无 |
| TaskUpdate | 任务 | 更新任务状态 | 无 |
| CronCreate | 定时 | 创建定时任务 | 无 |
| CronDelete | 定时 | 删除定时任务 | 无 |
| CronList | 定时 | 列出定时任务 | 无 |
| EnterWorktree | Git | 进入 git worktree | 无 |
| ExitWorktree | Git | 退出 git worktree | 无 |
| AskUser | 交互 | 向用户提问 | 有（ask-user） |
| ReadImage | 文件 | 读取图片（多模态） | 无 |
| ReadPDF | 文件 | 读取 PDF 文件 | 无 |

Ling 的 8 个工具覆盖了最核心的能力（文件读写 + 搜索 + 命令执行 + 用户交互）。Claude Code 多出的工具主要在三个方向扩展：任务管理（Todo/Task/Cron）、网络能力（WebFetch/WebSearch）、专用格式（Notebook/PDF/Image）。

---

## D.4 推荐阅读顺序

如果你想深入读 Claude Code 的源码，建议按这个顺序：

**第一轮：跟着消息流走一遍**

1. `cli/main` — 看启动流程：参数解析 → Provider 初始化 → Agent Loop 启动
2. `core/agent` — 看主循环：和 Ling 的 `ling.ts` 对比，理解结构差异
3. `tools/Read` 和 `tools/Bash` — 挑两个最常用的工具，看实现细节
4. `permissions/guard` — 看权限检查怎么嵌入工具执行流程

**第二轮：看差异化的模块**

5. `context/compactor` — 对比 Ling 的实现，看工业级的上下文压缩怎么做
6. `config/` — 理解 6 层配置的加载和合并逻辑
7. `hooks/` — 看 Hook handler 怎么影响工具执行决策

**第三轮：看我们没实现的**

8. `skills/` — Skill 系统的加载、解析、执行
9. `worktree/` — Git worktree 的完整生命周期
10. `lsp/` — LSP 集成的实现方式

每轮大约需要 2-3 小时。第一轮最重要——走完消息流，整个架构就清楚了。
