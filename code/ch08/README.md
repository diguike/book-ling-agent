# 第8章：Hook系统与MCP

> 通过生命周期 Hook 实现可插拔扩展，通过 MCP 协议接入外部工具服务器

## 本章目标

- 设计 Hook 引擎，在 Agent 循环的关键节点（tool_call 前后、消息前后）插入自定义逻辑
- 支持 `.ling-hooks.json` 配置文件定义 Hook 规则
- 实现 MCP（Model Context Protocol）客户端，动态发现并调用外部工具服务器
- 附带一个 SQLite MCP Server 示例

## 文件结构

```
src/
├── ling.ts                       — 主循环，集成 Hook 和 MCP
├── hooks/
│   ├── index.ts                  — Hook 统一导出
│   ├── types.ts                  — Hook 上下文与结果类型
│   ├── engine.ts                 — Hook 引擎，按事件触发 Hook 链
│   └── config.ts                 — Hook 配置加载
├── mcp/
│   ├── index.ts                  — MCP 统一导出
│   ├── types.ts                  — MCP 工具类型定义
│   ├── client.ts                 — MCP 客户端，与 Server 通信
│   └── loader.ts                 — MCP Server 配置加载与启动
└── mcp-servers/
    └── sqlite-server.ts          — 示例：SQLite MCP Server
```

## 如何运行

```bash
cd code/ch08
npm install
# 设置环境变量
export OPENAI_API_KEY="your-api-key"
export OPENAI_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
export LLM_MODEL="doubao-1.5-pro-32k-250115"
# 运行
npx tsx src/ling.ts
```

## 关键概念

本章引入两大扩展机制。Hook 系统让开发者在不修改核心代码的前提下插入自定义逻辑（如审计日志、自动审批、输出过滤）。MCP 则是标准化的工具扩展协议，Agent 启动时自动连接配置的 MCP Server，将其提供的工具动态注册到工具表中，实现跨进程的工具调用。
