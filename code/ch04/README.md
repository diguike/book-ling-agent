# 第4章：上下文工程

> System Prompt 分层构建 + 项目感知 + .ling.md 用户指令 + 长对话自动压缩

## 本章目标

- 构建分层 System Prompt（角色 + 环境 + 项目约定 + 用户指令）
- 实现项目类型自动检测（Node.js / Python / Rust 等）
- 支持 `.ling.md` 项目级配置文件
- 实现对话历史压缩（Compactor），避免超出上下文窗口

## 文件结构

```
src/
├── ling.ts                       — 主循环，集成上下文引擎
└── context/
    ├── index.ts                  — 统一导出
    ├── system-prompt.ts          — 分层 System Prompt 构建器
    ├── project-detector.ts       — 项目类型自动检测
    ├── ling-md.ts                — .ling.md 文件解析
    └── compactor.ts              — 长对话压缩 / Token 预算管理
```

## 如何运行

```bash
cd code/ch04
npm install
# 设置环境变量
export LLM_API_KEY="your-api-key"
export LLM_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
export LLM_MODEL="doubao-1.5-pro-32k-250115"
# 运行
npx tsx src/ling.ts
```

## 关键概念

本章核心是「上下文工程」：System Prompt 不再是一段固定文字，而是根据运行环境、项目类型、用户配置动态拼装。当对话历史接近 Token 上限时，Compactor 会自动将早期对话压缩为摘要，在不丢失关键信息的前提下腾出空间。
