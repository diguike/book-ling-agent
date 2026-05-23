# 第2章：多模型适配

> 抽象 Provider 层，让同一个 Agent 无缝切换 OpenAI、Claude、火山引擎等不同 LLM

## 本章目标

- 将 LLM 调用从硬编码解耦为 Provider 接口
- 实现 OpenAI、Claude、Volcano（豆包）三种 Provider
- 通过工厂函数 + 环境变量自动选择 Provider

## 文件结构

```
src/
├── ling.ts                   — 主循环，使用 Provider 接口调用 LLM
└── providers/
    ├── index.ts              — 导出统一入口
    ├── types.ts              — Provider 接口定义（Tool、Message 等）
    ├── factory.ts            — 工厂函数，根据配置创建 Provider 实例
    ├── openai.ts             — OpenAI / 兼容 API 适配器
    ├── claude.ts             — Anthropic Claude 适配器
    └── volcano.ts            — 火山引擎（豆包）适配器
```

## 如何运行

```bash
cd code/ch02
npm install
# 设置环境变量
export LLM_API_KEY="your-api-key"
export LLM_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
export LLM_MODEL="doubao-1.5-pro-32k-250115"
# 运行
npx tsx src/ling.ts
```

## 关键概念

本章引入 Provider 抽象层，将「发送消息 + 解析响应」封装为统一接口。每个 Provider 负责将内部的 Tool/Message 格式翻译为对应平台的 API 格式，主循环代码完全不感知底层差异。通过 `factory.ts` 根据环境变量自动实例化对应的 Provider。
