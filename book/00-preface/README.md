---
title: 前言
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/UDzKwPffXiI2IjkQZnwcGnNOnmh"
last_synced: "2026-05-26T17:23:01Z"
---

> **配套资源**  
> 源码仓库 · [github.com/diguike/book-ling-agent](https://github.com/diguike/book-ling-agent)  
> 在线阅读 · [inferloop.dev/ling-agent](https://inferloop.dev/ling-agent)

# 前言

## 我为什么要写这本书

去年我开始重度用 Claude Code。一开始的感受是：这玩意儿是真能干活。让它修个 Bug，它会自己 grep 代码、读文件、改源码、跑测试、跑完告诉你它改了什么。不是 demo，是每天写业务代码时确实会被它替下手的程度。

但用得越久，越想知道它**内部到底怎么工作的**。

- 它怎么决定下一步是搜索、还是直接动手改？
- 几十个工具的 schema 全塞进 system prompt 里吗？token 不爆？
- 上下文写满了它怎么压缩？为什么压缩之后还像没"失忆"？
- `rm -rf` 这种命令它是怎么拦下来的？万一拦不住怎么办？
- 同一个任务它有时候开"子 Agent"并行，依据是什么？

这些问题，光看 Anthropic 的官方博客和文档答不上来。后来 Anthropic 把 Claude Code 的核心代码开源，社区也涌出一批仿写项目（OpenCode、Hermes、OpenClaw 等）。我挨个翻完它们的源码，写了《Hermes Agent 源码解读》和《OpenClaw 源码解析》两本书。

但写完这两本之后，我又卡住了一次。

**读源码理解一种架构是一回事，自己从零造出来又是另一回事。**

读源码时你看见的是"它已经长成这样"。你看不见作者中间废掉的几个版本，看不见某个抽象为什么是现在这个形状，分不清哪一步是设计、哪一步是历史包袱。只有自己从空文件开始，一行行敲到能跑，把每一个决定都过一遍脑子，"为什么"才会真正落到脑子里。

所以这本书的写法跟前两本反过来：**不分析任何现成 Agent 的源码，从零写一个**。代码量控制在 2000 行 TypeScript，但要做到工业级——多模型支持、三层权限拦截、流式输出、会话持久化、Hook、MCP 协议、子 Agent 并行、CI 模式。每一章我会讲清楚"为什么这样设计"，并且在结尾对照 Claude Code 是怎么做同一件事的。

成品叫 **Ling（灵）**，[开源在 GitHub](https://github.com/diguike/book-ling-agent)。这本书就是带你把它一行一行写出来的过程。

## 读完这本书你能造出什么

下面 8 个场景，都是你读完全书之后能自己实现的能力。先看效果，再决定要不要继续翻。

### 场景 1：项目理解——启动即分析

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

### 场景 2：多模型切换——doubao / claude / openai

国内用豆包（[火山引擎](https://www.volcengine.com/product/doubao)），速度快、便宜。需要强推理能力切 [Claude](https://www.anthropic.com/claude)。想用 [GPT-4o](https://openai.com/index/hello-gpt-4o/) 也行。一个配置文件搞定，运行时也能切。

```
$ ling --provider doubao
  Using: Doubao-pro-256k (Volcano Engine)

> /model claude

  Switched to: claude-sonnet-4-20250514 (Anthropic)

> /model openai

  Switched to: gpt-4o (OpenAI)
```

三家 API 的请求格式、tool calling 协议、流式返回结构全都不一样。第 2 章会手写三个 Provider 适配器，统一成一个接口。[Anthropic](https://www.anthropic.com) 的 `tool_use` 和 [OpenAI](https://openai.com) 的 `function calling` 在细节上差异不小——比如参数类型处理、多工具并发返回的方式，都得逐个磨平。

### 场景 3：自主修 Bug——搜索 + 编辑 + 确认

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

这次对话里 Ling 一共用了 4 个工具：`grep` 搜索、`read_file` 读文件、`edit_file` 改代码、`bash` 跑测试。工具的实现在第 3 章，调度它们的 Agent Loop 在第 1 章。组合起来，就是一个能自主解决问题的 Agent。

### 场景 4：权限拦截——危险操作先问人

Agent 能跑 shell 命令，这是个真实的安全问题。万一它执行 `rm -rf /`？万一它 `git push --force` 到 main？

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

这套机制在第 5 章实现，包括 glob 模式匹配、权限中间件、文件系统边界限制，以及 prompt injection 的基本防御。

### 场景 5：子 Agent 并行——拆任务并行执行

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

### 场景 6：MCP 接入数据库——外部数据源查询

[MCP（Model Context Protocol）](https://modelcontextprotocol.io) 是 Agent 工具的"USB 接口"。你不用把所有功能都写死在代码里，通过 MCP 可以接入任何外部工具。

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

### 场景 7：CI 管道模式——非交互 + 结构化输出

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

### 场景 8：会话恢复——退出后接着聊

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

## 你最终会带走什么

代码本身不是目的。读完这本书，你应该能带走这几样东西：

1. **一个能跑、能用、能改的开源 Agent 项目**——基于你自己写的代码，长出你想要的能力。
2. **Agent 工程的核心心智模型**——下次看任何一份 Agent 源码（Claude Code、Cursor、Aider、Cline……），都能在五分钟内对上号：Loop 在哪、工具怎么调度、权限怎么拦、上下文怎么管。
3. **一组可迁移的工程判断**——什么时候该开子 Agent、什么时候该压缩上下文、为什么权限要做成 `ask` 而不是直接 `allow`。这些只有自己写过才会内化，光读文档拿不到。

## 你需要准备什么

- **TypeScript 基础**——能看懂 `async/await`、`interface`、泛型就够。不需要精通，遇到新语法我会解释。
- **Node.js 环境**——Node.js 20 以上，npm 或 pnpm 都行。
- **一个 LLM API Key**——火山引擎（豆包）、Claude、OpenAI 任选一个。书里默认用豆包做演示，国内访问稳定，注册就送额度。三个都有最好，第 2 章会全部用到。
- **操作系统**——macOS 或 Linux。Windows 用户请使用 [WSL 2](https://learn.microsoft.com/zh-cn/windows/wsl/)，书中的 grep、bash 等工具直接调用系统命令，原生 Windows 不兼容。
- **一个终端和编辑器**——VS Code 或任何你顺手的都行。

读者画像、Ling 完整技术规格、相关书列表，在 [封面页](https://fivwvysqdz.feishu.cn/wiki/HtXZwJfm6ifNdnkmkx9c2vKenEf) 上。

## 全书路线图

11 章正文 + 终章 + 1 章 Claude Code 源码深读 + 4 篇附录。每一章在前一章的代码上递增，不跳步。

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
  C11 --> CF["终章<br/>从Ling到真实世界"]
  CF --> C12["第12章<br/>深入Claude Code<br/>源码对照"]
```

- **第 1-3 章**：拿到一个能对话、能用工具、能切模型的 Agent。这三章读完 Ling 已经能干不少活。
- **第 4-6 章**：上下文工程把项目信息塞进 system prompt 而不让 token 爆；权限系统是跑 shell 时的安全网；流式交互让响应跟得上你看屏幕的速度。
- **第 7-9 章**：会话持久化、Hook 生命周期扩展、MCP 工具插件——这一段把 Ling 从"能跑"推到"能长期用"。
- **第 10-11 章**：多 Agent 并行协作；从交互式 CLI 改造成能嵌入管道、跑在 CI 里的工具。
- **终章 + 第 12 章**：自己造过一遍 Agent 之后，回头读 Claude Code 的源码完全是另一种感受。第 12 章带你逐模块对照看。

每一章结尾有一个"对照 Claude Code"环节。Claude Code 是这个方向上做得最完整的产品，它的开源部分是最好的参照物。你写的每一个模块都能在 Claude Code 里找到对应的工业级实现。看看它怎么做、想想为什么那样做，比单纯跟着教程抄代码有用。

## 怎么读这本书

按你的目标走不同路线：

- **想快速上手**：第 1、3、5 章必读（Agent Loop、工具系统、权限），剩下章节按需查。这是"我只想拿一个能用的"的最短路径。
- **系统学习**：从第 1 章开始顺序读到第 11 章，每章动手把代码敲一遍。预计 25-40 小时，分两周做完比较合适。
- **冲着源码理解去**：先快速扫一遍 1-11 章把 Ling 跑通，重点啃第 12 章，对照 Claude Code 源码逐模块看。你已经自己造过一遍，看它的源码会比直接读快很多。
- **只想抄思路**：跳着翻你最感兴趣的章节。每一章基本独立，能拿单章去对应自己手上的项目。

---

行，话说到这。翻到第 1 章，打开编辑器，新建一个 `ling.ts`——50 行代码，你的第一个 Agent。

---

> 本章来自《自己动手写 AI Agent》开源版 · 作者「递归客」  
> 在线阅读完整书系：[inferloop.dev](https://inferloop.dev)  
> 源码仓库：[github.com/diguike/book-ling-agent](https://github.com/diguike/book-ling-agent)
