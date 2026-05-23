# 第5章：权限与安全

> 为工具调用加上权限守卫，防止 Agent 未经确认执行危险操作

## 本章目标

- 设计权限模型：allow / deny / ask 三级策略
- 实现基于 glob 模式的路径和命令匹配器
- 支持 `.ling-permissions.json` 项目级权限配置
- 敏感操作（如 `rm -rf`、写入系统目录）自动拦截或弹窗确认

## 文件结构

```
src/
├── ling.ts                       — 主循环，集成权限守卫
├── permissions/
│   ├── index.ts                  — 统一导出
│   ├── types.ts                  — 权限规则类型定义
│   ├── defaults.ts               — 内置默认权限规则
│   ├── config.ts                 — 权限配置加载
│   ├── matcher.ts                — glob 模式匹配器
│   └── guard.ts                  — 权限守卫，拦截 / 放行 / 询问
├── providers/
│   ├── index.ts                  — Provider 统一入口
│   ├── types.ts                  — Provider 接口定义
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
cd code/ch05
npm install
# 设置环境变量
export LLM_API_KEY="your-api-key"
export LLM_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
export LLM_MODEL="doubao-1.5-pro-32k-250115"
# 运行
npx tsx src/ling.ts
```

## 关键概念

本章引入 `PermissionGuard`，在每次工具执行前拦截请求并匹配权限规则。规则支持三种动作：`allow`（静默放行）、`deny`（直接拒绝）、`ask`（弹窗让用户确认）。匹配器基于 glob 模式，可以精确控制哪些路径可写、哪些命令可执行。
