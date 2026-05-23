# 第10章：完整版CLI

> 集所有章节之大成，构建可发布的完整 CLI 工具

## 本章目标

- 实现完整的 CLI 参数解析（交互 / 非交互 / 管道输入）
- 支持 `--print` 非交互模式、`--format` 输出格式、`--schema` JSON Schema 约束
- 集成 Provider、工具系统、权限守卫等全部模块
- 通过 `bin/ling` 提供全局可执行命令

## 文件结构

```
bin/
└── ling                          — 全局可执行入口（shebang 脚本）
src/
├── ling.ts                       — 主入口，交互 + 非交互模式
├── cli/
│   ├── index.ts                  — CLI 统一导出
│   ├── parser.ts                 — 命令行参数解析
│   ├── output.ts                 — 输出格式化（text / json / stream）
│   ├── print-mode.ts             — 非交互 print 模式
│   └── schema-validator.ts       — JSON Schema 输出校验
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
    ├── ask-user.ts               — 用户交互
    └── __tests__/
        └── tools.test.ts         — 工具测试
```

## 如何运行

```bash
cd code/ch10
npm install
# 设置环境变量
export LLM_API_KEY="your-api-key"
export LLM_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
export LLM_MODEL="doubao-1.5-pro-32k-250115"

# 交互模式
npx tsx src/ling.ts

# 非交互模式
npx tsx src/ling.ts -p "列出当前目录的文件"

# 管道输入
cat src/ling.ts | npx tsx src/ling.ts -p "分析这段代码"

# 全局安装后直接使用
npm link
ling -p "hello"
```

## 关键概念

本章是前九章的集大成之作。CLI 层提供完整的用户交互体验：交互式 REPL、非交互 print 模式、管道输入、JSON Schema 输出约束。底层集成了多模型 Provider、8 工具注册表、权限守卫等全部能力。通过 `bin/ling` + `package.json` 的 `bin` 字段，可以 `npm link` 后全局使用 `ling` 命令。
