# 第1章：50行Agent

> 用不到 80 行 TypeScript 实现一个能读文件、跑命令的最小 Agent

## 本章目标

- 理解 Agent = LLM + Tool Loop 的核心范式
- 使用 OpenAI SDK 发起带工具的聊天请求
- 实现最简 agent loop：调用 → 执行 → 回传 → 再调用

## 文件结构

```
ch01/
├── ling.ts         — 单文件 Agent，包含工具定义、执行和主循环
├── package.json
└── package-lock.json
```

## 如何运行

```bash
cd code/ch01
npm install
# 设置环境变量
export LLM_API_KEY="your-api-key"
export LLM_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
export LLM_MODEL="doubao-1.5-pro-32k-250115"
# 运行
npx tsx ling.ts
```

## 关键概念

本章演示 Agent 的最小可行实现：定义 `read_file` 和 `run_command` 两个工具，通过 while 循环不断将 LLM 的 tool_call 结果回传，直到模型给出最终文本回答。整个文件不到 80 行，没有抽象、没有框架，只有核心机制。
