# 第9章：多Agent协作

> 将单一 Agent 拆分为多个专职角色，通过调度器实现并行/串行协作

## 本章目标

- 定义多种 Agent 角色（Planner、Coder、Reviewer）
- 实现 Agent 生成器（Spawner），动态创建子 Agent 实例
- 构建任务调度器，支持并行和串行两种编排模式
- 支持 Git Worktree 隔离，多 Agent 同时修改代码互不干扰

## 文件结构

```
src/
├── ling.ts                       — 主循环，集成多 Agent 调度
├── agents/
│   ├── index.ts                  — 统一导出
│   ├── types.ts                  — Agent / Task / Registry 类型
│   ├── roles.ts                  — 角色定义（plan / code / review）
│   ├── spawner.ts                — 子 Agent 生成器
│   ├── scheduler.ts              — 任务调度（并行 / 串行）
│   └── worktree.ts               — Git Worktree 隔离管理
└── providers/
    ├── index.ts                  — Provider 入口
    ├── types.ts                  — Provider 接口
    ├── factory.ts                — Provider 工厂
    ├── openai.ts                 — OpenAI 适配器
    ├── claude.ts                 — Claude 适配器
    └── volcano.ts                — 火山引擎适配器
```

## 如何运行

```bash
cd code/ch09
npm install
# 设置环境变量
export LLM_API_KEY="your-api-key"
export LLM_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
export LLM_MODEL="doubao-1.5-pro-32k-250115"
# 运行
npx tsx src/ling.ts
```

## 关键概念

本章从「单 Agent 做所有事」演进为「多 Agent 分工协作」。Planner 负责拆解任务，Coder 负责实现代码，Reviewer 负责审查结果。Scheduler 编排这些角色的执行顺序，支持并行加速。Worktree 模块利用 Git Worktree 为每个并行 Agent 创建独立工作目录，避免文件冲突。
