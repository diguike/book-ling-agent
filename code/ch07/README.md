# 第7章：会话与记忆

> 让 Agent 拥有持久化会话和跨会话记忆，支持断点续聊与用户偏好记录

## 本章目标

- 实现会话持久化存储，支持 `--continue` 和 `--resume <id>` 恢复上下文
- 设计跨会话记忆系统（MemoryStore），让 Agent 记住用户的偏好和项目约定
- 提供 `--list-sessions` 查看历史会话、`--name` 命名会话

## 文件结构

```
src/
├── ling.ts                       — 主循环，集成会话管理与记忆
└── session/
    ├── index.ts                  — 统一导出
    ├── types.ts                  — Session / Message / Metadata 类型
    ├── store.ts                  — 会话持久化存储（JSON 文件）
    └── memory.ts                 — 跨会话记忆（save_memory 工具）
```

## 如何运行

```bash
cd code/ch07
npm install
# 设置环境变量
export OPENAI_API_KEY="your-api-key"
export OPENAI_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
export LLM_MODEL="doubao-1.5-pro-32k-250115"
# 运行
npx tsx src/ling.ts

# 恢复上次会话
npx tsx src/ling.ts --continue

# 查看历史会话
npx tsx src/ling.ts --list-sessions
```

## 关键概念

本章让 Agent 从「无状态」升级为「有记忆」。SessionStore 将每次对话的完整消息历史存储到本地文件，下次启动时可以恢复上下文继续对话。MemoryStore 则是更高层的抽象，Agent 可以主动调用 `save_memory` 工具将重要信息（用户偏好、项目约定）写入持久记忆，在所有后续会话中自动加载。
