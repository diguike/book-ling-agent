---
title: 《从0到1动手写 AI Agent：ling》
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/HtXZwJfm6ifNdnkmkx9c2vKenEf"
last_synced: "2026-05-26T17:23:01Z"
---

> **配套资源**  
> 源码仓库 · [github.com/diguike/book-ling-agent](https://github.com/diguike/book-ling-agent)  
> 在线阅读 · [inferloop.dev/ling-agent](https://inferloop.dev/ling-agent)  
> 反馈勘误 · 在 GitHub 提 Issue

# 《从0到1动手写 AI Agent：ling》

## 关于这本书

去年我开始重度用 Claude Code。让它修个 Bug，它会自己 grep 代码、读文件、改源码、跑测试——已经到了每天写业务代码时会被它替下手的程度。

但用得越久越想拆开看：它怎么决定下一步是搜索还是改代码？几十个工具的 schema 全塞进 system prompt 里 token 不爆？`rm -rf` 这种命令它是怎么拦下来的？

读完 Claude Code 的开源代码、写完《Hermes Agent 源码解读》和《OpenClaw 源码解析》两本之后，问题反而出来了：**读源码理解架构是一回事，自己从零造一个又是另一回事**。所以这本书反过来——不分析任何现成 Agent 的源码，从零写一个，2000 行 TypeScript，做到工业级。

成品叫 **Ling（灵）**。完整的动机故事和 8 个场景效果演示，在 [前言](https://fivwvysqdz.feishu.cn/wiki/UDzKwPffXiI2IjkQZnwcGnNOnmh) 里。

## Ling 能干什么

一个能干这些事的 AI 编程助手：

- **理解项目**：启动自动扫描 `package.json` / `git status` / 目录结构，把项目信息塞进 system prompt
- **多模型切换**：[火山引擎（豆包）](https://www.volcengine.com/product/doubao)、[Claude](https://www.anthropic.com)、[OpenAI](https://openai.com) 一套代码全跑通，运行时也能切
- **自主修 Bug**：搜索 → 定位代码 → 修改文件 → 跑测试，循环到搞定
- **权限拦截**：三层模型（allow / ask / deny），危险操作先问人，`rm -rf` 直接拦
- **子 Agent 并行**：大任务拆给多个子 Agent 同时做，每个有独立上下文
- **MCP 接入数据库 / 外部工具**：通过 [协议](https://modelcontextprotocol.io) 接 SQLite、GitHub、Slack，加新能力不用改 Agent 代码
- **CI 管道模式**：非交互执行，结构化 JSON 输出，可以嵌进 GitHub Actions
- **会话恢复**：所有对话历史持久化，下次 `--continue` 接着聊

每一项对应书中一章。

## 技术规格

| 项目 | 规格 |
|------|------|
| 语言 | TypeScript ([Node.js](https://nodejs.org) 20+) |
| LLM 支持 | 火山引擎（豆包）/ Claude / OpenAI |
| 内置工具 | 8 个（Bash、ReadFile、WriteFile、EditFile、Glob、Grep、ListFiles、AskUser） |
| 核心代码 | ~2000 行（不含依赖） |
| 外部依赖 | < 10 个 npm 包 |
| 协议支持 | MCP (Model Context Protocol) stdio 传输 |
| 运行模式 | 交互式 CLI / 非交互 CI/CD / Print 模式 |
| 权限模型 | 三层（allow / ask / deny），Glob 模式匹配 |
| 会话持久化 | 本地 JSON 文件 |
| 子 Agent | 支持并行，独立上下文 + Worktree 隔离 |

## 配套源码与运行

完整代码托管在 GitHub：**[github.com/diguike/book-ling-agent](https://github.com/diguike/book-ling-agent)**

```bash
# 1. 克隆仓库
git clone https://github.com/diguike/book-ling-agent.git
cd book-ling-agent

# 2. 配置环境变量（火山引擎免费额度够跑完全书）
export ARK_API_KEY="your-api-key"

# 3. 运行第一章的 50 行 Agent
cd code/ch01
npm install
npx tsx ling.ts "分析一下当前目录的文件结构"
```

跑完这三步你就有了一个能对话、能调用工具的 Agent。接下来跟着书一章一章加功能。

每章在前一章基础上递进，互不修改前面的接口——从任意一章切入都能跑起来。

## 谁该读这本书

**适合**：有 1-3 年经验的程序员，用过 ChatGPT 或 Claude，想知道这东西是怎么做出来的。不需要懂机器学习，不需要会训练模型——从头到尾只调 API，不碰权重。

**不适合**：

- 想学 [LangChain](https://www.langchain.com) / [LlamaIndex](https://www.llamaindex.ai) 这类框架的——这本书不用任何 Agent 框架，全部手写
- 想了解大模型原理和训练的——这本书只管调用，不管模型内部
- 已经读过 Claude Code 源码并且理解其架构的——可能觉得内容偏基础，可以直接跳到第 9-12 章

详细的环境准备清单在 [前言](https://fivwvysqdz.feishu.cn/wiki/UDzKwPffXiI2IjkQZnwcGnNOnmh) 里。

## 章节导航

11 章正文 + 终章 + 1 章源码深读 + 4 篇附录。每一章对应仓库里的 `book/<slug>/` 和 `code/ch<N>/`。

| 章节 | 标题 | 核心概念 |
|:----:|------|----------|
| 前言 | 从 Claude Code 到 Ling | 动机故事 · 8 个场景演示 |
| 第 1 章 | 50 行代码，你的第一个 Agent | Agentic Loop、Tool Use |
| 第 2 章 | 多模型适配 | Provider 抽象、OpenAI 兼容协议 |
| 第 3 章 | 工具系统 | Tool 注册、JSON Schema、Bash/File 工具 |
| 第 4 章 | 上下文工程 | System Prompt、项目感知、Token 预算 |
| 第 5 章 | 权限与安全 | 权限模型、沙箱、Prompt Injection 防御 |
| 第 6 章 | 流式交互 | SSE、流式 Tool Call、实时渲染 |
| 第 7 章 | 会话与记忆 | 多轮会话、持久化、上下文压缩 |
| 第 8 章 | Hook 系统 | 生命周期钩子、事件驱动扩展 |
| 第 9 章 | MCP 协议 | Model Context Protocol、外部工具接入 |
| 第 10 章 | 多 Agent 协作 | Agent 编排、任务分发、SubAgent |
| 第 11 章 | 从 CLI 到生产 | 非交互模式、CI/CD、Print 模式 |
| 终章 | 从 Ling 到真实世界 | 回顾与展望 |
| 第 12 章 | 深入 Claude Code 源码 | 真实世界 Agent 的差距 |

**附录**：A 三家 LLM API 对比 · B Ling 完整代码索引 · C MCP 协议规范速查 · D Claude Code 源码导航

## 怎么读这本书

按目标取最短路径：

- **快速上手（半天）**：直接读第 1、3、11 章，跑 `code/ch01` 和 `code/ch10`，对 Agent 的最小骨架和最终形态都有体感
- **系统学习（一周）**：按顺序读 1 → 11 章，每章读完跑对应 `code/chXX/`，遇到陌生概念翻附录 A、C
- **深入源码（两周）**：通读全书后读第 12 章和附录 D，对照 [Claude Code](https://www.anthropic.com/claude-code) 源码做一遍逆向阅读，找出 Ling 没实现的工业级细节

每一章都有"对照 Claude Code"环节——你写的每个模块，都能在 Claude Code 里找到对应的工业级实现。

更详细的阅读路线（包括"只想抄思路"那条）在 [前言](https://fivwvysqdz.feishu.cn/wiki/UDzKwPffXiI2IjkQZnwcGnNOnmh) 里。

## 反馈与勘误

发现错误、有改进建议，请在 GitHub 仓库提 Issue：[github.com/diguike/book-ling-agent/issues](https://github.com/diguike/book-ling-agent/issues)。

PR 也欢迎——一行错别字到一整章重写都接受。

## 相关书

来自同一作者的其他书：

- [《Hermes Agent 源码解读》](https://inferloop.dev/hermes-agent)
- [《LLM Infra 工程实战》](https://inferloop.dev/llm-infra)
- [《AI Token 中转站实战》](https://inferloop.dev/llm-gateway)
- [《Agent Memory 工程实战》](https://inferloop.dev/claude-mem)
- [《百万级 AI Agent 平台架构》](https://inferloop.dev/enterprise-agent)
- [《OpenClaw 源码解析》](https://inferloop.dev/openclaw)
- [《Transformer 教学》](https://inferloop.dev/transformer)
- [《Claude Code Skill 开发指南》](https://inferloop.dev/claude-skill)
- [《Claude 插件官方指南》](https://inferloop.dev/claude-plugins)
