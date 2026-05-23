# 附录 B · Ling 完整代码索引

所有代码在 `code/` 目录下，按章节组织。每章是一个独立可运行的项目，包含该章新增的模块以及之前章节的依赖代码。

---

## 章节递进关系

```
ch01  单文件 Agent（50 行）
 │
 ├→ ch02  多 Provider 抽象（加 providers/）
 │
 ├→ ch03  工具系统（加 tools/）
 │
 ├→ ch04  上下文工程（加 context/）
 │
 ├→ ch05  权限系统（加 permissions/，tools/ 接入权限检查）
 │
 ├→ ch06  流式输出（加 streaming/，providers/ 支持 stream）
 │
 ├→ ch07  会话与记忆（加 session/）
 │
 ├→ ch08  Hook 系统（加 hooks/）
 │
 ├→ ch09  MCP（加 mcp/、mcp-servers/）
 │
 ├→ ch10  多 Agent（加 agents/）
 │
 └→ ch11  生产级 CLI（加 cli/）
```

每章新增一个目录，不修改之前的模块接口。这意味着你可以从任意一章开始看代码，只要先理解它依赖的模块就行。

---

## ch01 · 第一个 Agent

| 文件 | 作用 |
|------|------|
| `ling.ts` | 完整的 Agent 实现：调 LLM → 解析 tool call → 执行工具 → 循环。50 行。 |
| `package.json` | 唯一依赖：`openai` |

这是整本书的起点。所有后续章节都是在拆解和增强这 50 行代码。

---

## ch02 · 多 Provider 支持

| 文件 | 作用 |
|------|------|
| `src/ling.ts` | Agent 主循环，改为调用 Provider 接口而非直接调 OpenAI |
| `src/providers/types.ts` | `LLMProvider` 接口定义：`chat(messages, tools)` |
| `src/providers/volcano.ts` | 火山引擎（豆包）适配器 |
| `src/providers/claude.ts` | Anthropic Claude 适配器，处理 system prompt 差异和 content block 格式 |
| `src/providers/openai.ts` | OpenAI 适配器 |
| `src/providers/factory.ts` | 工厂函数：根据配置字符串创建对应 Provider 实例 |
| `src/providers/index.ts` | 统一导出 |

---

## ch03 · 工具系统

| 文件 | 作用 |
|------|------|
| `src/ling.ts` | 主循环接入工具注册表 |
| `src/tools/types.ts` | `Tool` 接口定义：`name`、`description`、`parameters`、`execute()` |
| `src/tools/read-file.ts` | 读文件工具，支持行号范围 |
| `src/tools/write-file.ts` | 写文件工具，整文件覆写 |
| `src/tools/edit-file.ts` | 编辑工具，基于字符串精确替换 |
| `src/tools/bash.ts` | 执行 shell 命令，有超时控制 |
| `src/tools/glob.ts` | 文件名模式匹配搜索 |
| `src/tools/grep.ts` | 文件内容正则搜索 |
| `src/tools/list-files.ts` | 列出目录结构 |
| `src/tools/ask-user.ts` | 向用户提问，获取澄清信息 |
| `src/tools/index.ts` | 工具注册表：收集所有工具、导出 JSON Schema |

---

## ch04 · 上下文工程

| 文件 | 作用 |
|------|------|
| `src/ling.ts` | 启动时调用 Context Engine 构建 system prompt |
| `src/context/system-prompt.ts` | 组装最终的 system prompt：基础指令 + 项目信息 + .ling.md |
| `src/context/project-detector.ts` | 扫描项目：读 package.json / pyproject.toml / Cargo.toml 等，识别技术栈 |
| `src/context/ling-md.ts` | 查找并解析 `.ling.md` 文件（项目级自定义指令） |
| `src/context/compactor.ts` | 上下文压缩：当消息历史超过 token 预算时，用 LLM 做摘要 |
| `src/context/index.ts` | 统一导出 |

---

## ch05 · 权限与安全

| 文件 | 作用 |
|------|------|
| `src/ling.ts` | 工具执行前调用 Permission Guard |
| `src/permissions/types.ts` | 权限类型：`allow` / `deny` / `ask`，规则结构定义 |
| `src/permissions/defaults.ts` | 默认权限规则：读操作放行，写操作询问，危险命令拒绝 |
| `src/permissions/config.ts` | 从配置文件加载用户自定义规则 |
| `src/permissions/matcher.ts` | 规则匹配器：路径 glob + 命令正则 |
| `src/permissions/guard.ts` | Permission Guard 主逻辑：遍历规则、匹配、决策 |
| `src/permissions/index.ts` | 统一导出 |
| `src/tools/*.ts` | 每个工具增加 `permission` 字段声明所需权限 |

---

## ch06 · 流式输出

| 文件 | 作用 |
|------|------|
| `src/ling.ts` | 主循环改为流式接收 + 逐 token 渲染 |
| `src/streaming/types.ts` | 流式事件类型：`text` / `tool_call_start` / `tool_call_delta` / `tool_call_end` / `finish` |
| `src/streaming/collector.ts` | 流式碎片收集器：把 delta 拼成完整的 message 和 tool call |
| `src/streaming/renderer.ts` | 终端渲染器：实时打印文本、显示工具调用进度 |
| `src/providers/*.ts` | 各 Provider 增加 `stream()` 方法 |

---

## ch07 · 会话与记忆

| 文件 | 作用 |
|------|------|
| `src/ling.ts` | 启动时加载历史会话，结束时保存 |
| `src/session/types.ts` | 会话数据结构：`Session`（元数据）+ `Message[]`（历史消息） |
| `src/session/store.ts` | 会话持久化：JSON 文件读写，按 session ID 索引 |
| `src/session/memory.ts` | 跨会话记忆：MemoryStore 读写、MEMORY.md 索引维护、frontmatter 解析 |
| `src/session/index.ts` | 统一导出 |

---

## ch08 · Hook 系统

| 文件 | 作用 |
|------|------|
| `src/ling.ts` | 主循环在关键节点触发 hook 事件 |
| `src/hooks/types.ts` | Hook 事件类型：`PreToolUse` / `PostToolUse` / `SessionStart` / `SessionEnd` |
| `src/hooks/engine.ts` | Hook 引擎：注册 handler、按事件类型分发 |
| `src/hooks/config.ts` | 从配置文件加载 hook 定义 |
| `src/hooks/index.ts` | 统一导出 |

---

## ch09 · MCP

| 文件 | 作用 |
|------|------|
| `src/mcp/types.ts` | MCP 消息类型定义（JSON-RPC 2.0） |
| `src/mcp/client.ts` | MCP 客户端：初始化连接、调用 tools/list、调用 tools/call |
| `src/mcp/loader.ts` | MCP Server 加载器：读配置、启动进程、建立 stdio 通信 |
| `src/mcp/index.ts` | 统一导出 |
| `src/mcp-servers/sqlite-server.ts` | 示例 MCP Server：暴露 SQLite 查询能力 |

---

## ch10 · 多 Agent 调度

| 文件 | 作用 |
|------|------|
| `src/agents/types.ts` | Sub-Agent 类型定义：`AgentTask`、`AgentResult`、`AgentRole` |
| `src/agents/roles.ts` | 预定义角色：`coder`（写代码）、`reviewer`（审查）、`researcher`（调研） |
| `src/agents/spawner.ts` | Agent 生成器：创建子 Agent 进程，注入角色 prompt 和受限工具集 |
| `src/agents/scheduler.ts` | 任务调度器：拆分任务、分配给子 Agent、收集结果、汇总 |
| `src/agents/index.ts` | 统一导出 |

---

## ch11 · 生产级 CLI

| 文件 | 作用 |
|------|------|
| `src/cli/parser.ts` | 命令行参数解析：`--provider`、`--model`、`--print`、`--resume`、`-p` 等 |
| `src/cli/output.ts` | 输出格式化：普通模式（交互式）和 print 模式（纯文本输出，适合管道） |
| `src/cli/schema-validator.ts` | 工具参数 JSON Schema 校验器 |
