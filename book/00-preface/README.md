# 前言 · 先看最终效果

你打算写一个 AI 编程助手。

不是那种调一下 ChatGPT API、把回复打印出来就完事的玩具。你想做的是一个**真正能干活**的 Agent——丢给它一个项目，它能自己看代码、找 Bug、改文件、跑测试，干完还能告诉你它改了什么。

这本书就是带你从零写出这样一个东西。它叫 Ling（灵）。

动手之前，先看看 Ling 的完成品长什么样。下面 8 个场景，都是你读完全书后能自己实现的能力。

---

## 场景 1：项目理解——启动即分析

Ling 启动时会自动扫描当前项目，读 `package.json`、看 `git status`、数目录结构，然后把这些信息塞进 system prompt。你不用告诉它"这是一个什么项目"，它已经知道了。

```
$ cd ~/my-express-app && ling

  ╭──────────────────────────────────────╮
  │  Ling v0.1.0                         │
  │  项目: my-express-app (Express.js)   │
  │  文件: 47 个  依赖: 12 个            │
  │  分支: feat/user-auth (3 commits)    │
  ╰──────────────────────────────────────╯

> 这个项目在做什么？

  我扫描了项目结构，这是一个 Express.js 后端服务，主要功能：

  1. 用户认证（src/auth/）—— 基于 JWT，刚加了 3 个 commit
  2. RESTful API（src/routes/）—— 用户和文章两组 CRUD
  3. PostgreSQL 数据存储（src/models/）—— 用 Prisma ORM

  目前 feat/user-auth 分支有 3 个未合并的 commit，都是
  在做密码重置功能。src/auth/reset.ts 写了一半，还没有
  对应的测试文件。
```

这不是魔法。第 4 章会讲上下文工程——怎么从项目里提取关键信息，怎么在有限的 token 预算内塞进最有用的上下文。

## 场景 2：多模型切换——doubao / claude / openai

国内用豆包（火山引擎），速度快、便宜。需要强推理能力切 Claude。想用 GPT-4o 也行。一个配置文件搞定，运行时也能切。

```
$ ling --provider doubao
  Using: Doubao-pro-256k (Volcano Engine)

> /model claude

  Switched to: claude-sonnet-4-20250514 (Anthropic)

> /model openai

  Switched to: gpt-4o (OpenAI)
```

三家 API 的请求格式、tool calling 协议、流式返回结构全都不一样。第 2 章会手写三个 Provider 适配器，统一成一个接口。你会发现 Anthropic 的 `tool_use` 和 OpenAI 的 `function calling` 在细节上差异不小——比如参数类型处理、多工具并发返回的方式。

## 场景 3：自主修 Bug——搜索 + 编辑 + 确认

这是 Agent 最核心的能力循环：**理解问题 → 定位代码 → 修改文件 → 验证结果**。

```
$ ling

> 用户注册接口返回 500，帮我查一下

  ● grep "register" src/routes/*.ts
    Found 3 matches

  ● read_file src/routes/user.ts:42-68
    Reading lines 42-68...

  找到了。src/routes/user.ts 第 55 行，bcrypt.hash() 的
  第二个参数 saltRounds 写成了字符串 "10"，应该是数字 10。

  ● edit_file src/routes/user.ts
    L55: - const hash = await bcrypt.hash(password, "10")
    L55: + const hash = await bcrypt.hash(password, 10)

  ⚠ 修改 src/routes/user.ts？(Y/n) y

  ✔ 已保存

  ● bash npm test -- --grep "register"
    PASS src/routes/__tests__/user.test.ts
    ✓ POST /register returns 201 (45ms)

  测试通过了。问题就是 saltRounds 的类型错误，bcrypt
  期望 number 但拿到了 string，内部抛了异常。
```

看到了吗？Ling 用了 4 个工具：`grep` 搜索、`read_file` 读文件、`edit_file` 改代码、`bash` 跑测试。这些工具的实现在第 3 章，Agent Loop 的循环逻辑在第 1 章。它们组合在一起，就是一个能自主解决问题的 Agent。

## 场景 4：权限拦截——危险操作先问人

Agent 能跑 shell 命令，这事说起来就让人后背发凉。万一它执行 `rm -rf /`？万一它 `git push --force` 到 main？

Ling 有一套三层权限模型：`allow`（直接放行）、`ask`（先问用户）、`deny`（直接拒绝）。

```
> 帮我清理一下临时文件

  ● bash rm -rf /tmp/my-app-cache/
    ⚠ 命令匹配规则 [deny]: rm -rf *
    ✖ 已拦截。该命令被安全策略禁止。

  换个安全的方式。

  ● bash find /tmp/my-app-cache -name "*.tmp" -delete
    ⚠ 需要确认：删除 /tmp/my-app-cache 下的 .tmp 文件？(Y/n) y
    Deleted 23 files.

  清理完毕，删除了 23 个 .tmp 文件。没有动其他文件。
```

`rm -rf` 被直接拦截，连问都不问。`find -delete` 虽然也是删除操作，但目标更精确，所以走的是 `ask` 流程——让你确认一下再执行。

这套机制在第 5 章实现。你会学到 glob 模式匹配、权限中间件、文件系统边界限制，还有 prompt injection 的基本防御。

## 场景 5：子 Agent 并行——拆任务并行执行

一个大任务，比如"把这个 Express 项目迁移到 Hono"，一个 Agent 独自干会很慢。Ling 可以拆成多个子 Agent 并行干。

```
> 把项目从 Express 迁移到 Hono

  分析完毕，拆分为 3 个子任务并行执行：

  ┌─────────────────────────────────────────────┐
  │ Agent-1 [routes]    迁移 src/routes/ 下的   │
  │                     5 个路由文件             │
  │ Agent-2 [middleware] 迁移 3 个中间件         │
  │ Agent-3 [config]    替换依赖 + 改入口文件   │
  └─────────────────────────────────────────────┘

  ● Agent-1 [routes]     ✔ 完成 (12s) — 5 files changed
  ● Agent-3 [config]     ✔ 完成 (8s)  — 3 files changed
  ● Agent-2 [middleware]  ✔ 完成 (15s) — 3 files changed

  所有子任务完成。汇总变更：

  - 替换依赖：express → hono (+@hono/node-server)
  - 迁移路由文件 5 个，中间件 3 个
  - 入口 app.ts 重写
  - 修改点：Express 的 req.body 改为 c.req.json()，
    res.json() 改为 c.json()，中间件签名全部适配

  ● bash npm test
    PASS (47 tests, 0 failures)
```

每个子 Agent 有独立的上下文窗口，只看自己负责的文件，互不干扰。第 10 章会实现 `AgentSpawner`、并行调度器和结果聚合。

## 场景 6：MCP 接入数据库——外部数据源查询

MCP（Model Context Protocol）是 Agent 工具的"USB 接口"。你不用把所有功能都写死在代码里，通过 MCP 可以接入任何外部工具。

```
$ cat .ling/mcp.json
{
  "servers": {
    "sqlite": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sqlite",
               "--db-path", "./data/app.db"]
    }
  }
}

$ ling

> 用户表里有多少条记录？最近注册的 5 个人是谁？

  ● mcp:sqlite query
    SELECT COUNT(*) as total FROM users;
    → total: 1,247

  ● mcp:sqlite query
    SELECT name, email, created_at FROM users
    ORDER BY created_at DESC LIMIT 5;

  用户表共 1,247 条记录。最近注册的 5 人：

  | 姓名     | 邮箱                | 注册时间        |
  |----------|---------------------|-----------------|
  | 张三     | zhang3@example.com  | 2026-04-08 14:22|
  | 李四     | li4@example.com     | 2026-04-08 11:05|
  | 王五     | wang5@test.io       | 2026-04-07 22:18|
  | 赵六     | zhao6@gmail.com     | 2026-04-07 19:33|
  | 陈七     | chen7@corp.cn       | 2026-04-07 16:47|
```

Ling 自己不懂 SQL，也不知道你的数据库长什么样。它只是通过 MCP 协议连接了一个 SQLite Server，剩下的事——发现有哪些工具可用、传参数、拿结果——全是协议规定好的。第 9 章会从零实现 MCP Client，还会手写一个 MCP Server。

## 场景 7：CI 管道模式——非交互 + 结构化输出

Agent 不只是给人用的，也可以嵌进 CI/CD 管道里，给机器用。

```yaml
# .github/workflows/pr-review.yml
- name: AI Code Review
  run: |
    cat diff.patch | ling -p "Review this diff" \
      --provider doubao \
      --format json \
      --schema '{"issues": [{"file":"string","line":"number",
                "severity":"string","message":"string"}]}'
```

```json
{
  "issues": [
    {
      "file": "src/auth/reset.ts",
      "line": 23,
      "severity": "error",
      "message": "resetToken 没有设置过期时间，安全风险"
    },
    {
      "file": "src/auth/reset.ts",
      "line": 41,
      "severity": "warning",
      "message": "catch 块吞掉了异常，建议至少打个日志"
    }
  ]
}
```

`-p` 参数让 Ling 进入 print 模式：读 stdin、调 LLM、输出结果、退出。`--format json` 加 `--schema` 可以约束输出格式，方便下游程序解析。这些在第 11 章实现。

## 场景 8：会话恢复——退出后接着聊

你花了 20 分钟让 Ling 分析一个复杂的代码问题，分析到一半要去开会。回来之后：

```
$ ling --continue

  ╭───────────────────────────────────────────╮
  │  恢复会话: "debug auth module" (30 min ago)│
  │  消息: 24 条  工具调用: 11 次              │
  ╰───────────────────────────────────────────╯

  [恢复上下文...]

> 刚才分析到哪了？

  上次我们在排查 JWT 刷新逻辑的竞态条件。已经定位到
  src/auth/token.ts 的 refreshToken() 函数——两个并发
  请求可能同时通过旧 token 的校验，导致签发两个新 token。

  我提了一个方案但还没确认：用 Redis SET NX 做一个简单的
  分布式锁。要继续看这个方案吗？
```

所有对话历史（包括工具调用记录）都持久化在本地。`--continue` 恢复最近的会话，`--resume <id>` 恢复指定会话。第 7 章会实现 Session 存储和跨会话记忆。

---

## 技术规格

看完场景，来看硬数据。这是 Ling 完成品的技术规格：

| 项目 | 数值 |
|------|------|
| 核心代码量 | ~2000 行 TypeScript |
| 内置工具 | 8 个（read_file / write_file / edit_file / grep / glob / bash / list_files / ask_user） |
| LLM Provider | 3 个（火山引擎（豆包）/ Claude / OpenAI） |
| 运行时 | Node.js 20+ |
| 外部依赖 | < 10 个 npm 包 |
| 协议支持 | MCP (Model Context Protocol) stdio 传输 |
| 输出模式 | 交互式 / Print / Stream JSON |
| 权限模型 | 三层（allow / ask / deny），Glob 模式匹配 |
| 会话持久化 | 本地 JSON 文件 |
| 子 Agent | 支持并行，独立上下文 + Worktree 隔离 |

2000 行代码听起来不多。但它涵盖了一个工业级 Agent 的核心架构。每一行你都会亲手写，而且知道为什么这样写。

---

## 本书适合谁

**目标读者**：有 1-3 年经验的程序员，用过 ChatGPT 或 Claude，好奇"这东西到底是怎么做出来的"，想自己动手造一个。

你不需要懂机器学习，不需要会训练模型。这本书从第一行代码到最后一行代码都在应用层——调 API，不碰权重。

**你需要准备**：

- **TypeScript 基础**——能看懂 `async/await`、`interface`、`泛型` 就够。不需要精通，遇到的新语法我会解释。
- **Node.js 环境**——Node.js 20 以上，npm 或 pnpm 都行。
- **一个 LLM API Key**——火山引擎（豆包）、Claude、OpenAI 任选一个。书里默认用豆包做演示，因为国内访问稳定，注册就送额度。三个都有最好，第 2 章会全部用到。
- **操作系统**——macOS 或 Linux。Windows 用户请使用 WSL 2（Windows Subsystem for Linux），因为书中的 grep、bash 等工具直接调用系统命令，原生 Windows 不兼容。
- **一个终端和编辑器**——VS Code 或任何你顺手的都行。

**不适合的读者**：

- 想学 LangChain / LlamaIndex 这类框架的——这本书不用任何 Agent 框架，全部手写。
- 想了解大模型原理和训练的——这本书只管调用，不管模型内部。
- 已经读过 Claude Code 源码并且理解其架构的——你可能会觉得内容太基础。

---

## 全书路线图

11 章，从一个 50 行的玩具到一个能跑在生产环境的 Agent。每一章都在前一章的代码上递增，不跳步。

```mermaid
graph LR
  C1["第1章<br/>50行代码<br/>最小Agent"] --> C2["第2章<br/>多模型适配器<br/>3家LLM"]
  C2 --> C3["第3章<br/>工具系统<br/>8个工具+Registry"]
  C3 --> C4["第4章<br/>上下文工程<br/>.ling.md"]
  C4 --> C5["第5章<br/>权限与安全<br/>三层拦截"]
  C5 --> C6["第6章<br/>流式交互<br/>逐Token渲染"]
  C6 --> C7["第7章<br/>会话与记忆<br/>持久化"]
  C7 --> C8["第8章<br/>Hook系统<br/>生命周期扩展"]
  C8 --> C9["第9章<br/>MCP<br/>工具插件协议"]
  C9 --> C10["第10章<br/>多Agent协作<br/>并行调度"]
  C10 --> C11["第11章<br/>CLI→生产<br/>CI集成"]
```

**第 1-3 章**是地基。你会拿到一个能对话、能用工具、能切模型的 Agent。这三章完成后，Ling 就已经能干不少活了。

**第 4-6 章**是打磨。上下文工程让 Agent 更聪明，权限系统让它更安全，流式交互让它用起来不像在等一个 HTTP 请求。

**第 7-9 章**是进阶。会话持久化、Hook 生命周期扩展、MCP 工具插件——这些是把 Ling 从"能用"推向"好用"的关键。

**第 10-11 章**是收官。多 Agent 并行协作，再把 Ling 从一个交互式 CLI 变成一个可以嵌入管道、跑在 CI 里的生产力工具。

每一章结尾都有一个"对照 Claude Code"环节。Claude Code 是目前最成熟的 AI 编程助手之一，它的开源版本是我们最好的参照物。你写的每个模块，都能在 Claude Code 里找到对应的工业级实现。看看它怎么做的，想想为什么那样做，比单纯跟着教程抄代码有用。

---

行，废话到此为止。翻到第 1 章，打开编辑器，新建一个 `ling.ts`——50 行代码，你的第一个 Agent。
