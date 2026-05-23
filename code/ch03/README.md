# 第3章：工具系统

> 构建完整的 8 工具体系——读、写、编辑、搜索、执行，让 Agent 具备真正的编码能力

## 本章目标

- 设计可扩展的工具注册表（Tool Registry）
- 实现 8 个核心工具：read_file、write_file、edit_file、glob、grep、list_files、bash、ask_user
- 通过 `createToolRegistry()` 统一管理工具定义与执行

## 文件结构

```
src/
├── ling.ts                       — 主循环，集成工具注册表
└── tools/
    ├── index.ts                  — 工具注册表，统一导出
    ├── types.ts                  — 工具接口定义
    ├── read-file.ts              — 读取文件内容
    ├── write-file.ts             — 写入文件
    ├── edit-file.ts              — 精确字符串替换编辑
    ├── glob.ts                   — 按模式搜索文件名
    ├── grep.ts                   — 按正则搜索文件内容
    ├── list-files.ts             — 列出目录文件
    ├── bash.ts                   — 执行 shell 命令
    ├── ask-user.ts               — 向用户提问确认
    └── __tests__/
        └── tools.test.ts         — 工具单元测试
```

## 如何运行

```bash
cd code/ch03
npm install
# 设置环境变量
export OPENAI_API_KEY="your-api-key"
export OPENAI_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
export LLM_MODEL="doubao-1.5-pro-32k-250115"
# 运行
npx tsx src/ling.ts
```

## 关键概念

本章将工具从硬编码提升为注册表模式：每个工具是一个独立模块，包含 `definition`（JSON Schema 描述）和 `execute`（实际执行函数）。`createToolRegistry()` 汇总所有工具并提供 `toOpenAITools()` 转换方法，使主循环与工具实现完全解耦。
