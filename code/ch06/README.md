# 第6章：流式交互

> 实现 SSE 流式输出，让 Agent 的回答像打字机一样逐字呈现

## 本章目标

- 使用 LLM 的 streaming API 实时获取 token
- 实现流式渲染器，将文本和工具调用实时输出到终端
- 流式收集器将碎片 delta 拼装为完整的 message 对象

## 文件结构

```
src/
├── ling.ts                       — 主循环，使用流式 API
├── streaming/
│   ├── types.ts                  — 流式事件类型定义
│   ├── collector.ts              — 将流式 delta 收集为完整消息
│   └── renderer.ts               — 终端实时渲染（文本 + 工具调用状态）
├── permissions/
│   ├── index.ts                  — 权限统一导出
│   ├── types.ts                  — 权限类型
│   ├── defaults.ts               — 默认权限规则
│   ├── config.ts                 — 权限配置加载
│   ├── matcher.ts                — 模式匹配器
│   └── guard.ts                  — 权限守卫
├── providers/
│   ├── index.ts                  — Provider 入口
│   ├── types.ts                  — Provider 接口
│   ├── factory.ts                — Provider 工厂
│   ├── openai.ts                 — OpenAI 适配器
│   ├── claude.ts                 — Claude 适配器
│   └── volcano.ts                — 火山引擎适配器
└── tools/
    ├── index.ts                  — 工具注册表
    ├── types.ts                  — 工具接口
    ├── read-file.ts              — 读取文件
    ├── write-file.ts             — 写入文件
    ├── edit-file.ts              — 编辑文件
    ├── glob.ts                   — 文件名搜索
    ├── grep.ts                   — 内容搜索
    ├── list-files.ts             — 列出目录
    ├── bash.ts                   — 执行命令
    └── ask-user.ts               — 用户交互
```

## 如何运行

```bash
cd code/ch06
npm install
# 设置环境变量
export LLM_API_KEY="your-api-key"
export LLM_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
export LLM_MODEL="doubao-1.5-pro-32k-250115"
# 运行
npx tsx src/ling.ts
```

## 关键概念

本章将 LLM 调用从「等待完整响应」切换为「流式接收」。`collector` 负责将多个 SSE delta 事件拼装为完整的 message（包括文本和 tool_calls），`renderer` 负责实时在终端渲染打字效果和工具调用进度指示。流式模式大幅改善了用户体验，不再需要等待数秒才能看到输出。
