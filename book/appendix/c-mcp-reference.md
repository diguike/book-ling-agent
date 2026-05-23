# 附录 C · MCP 协议速查

MCP（Model Context Protocol）是 Anthropic 发布的开放协议，让 LLM 应用能以标准方式连接外部工具和数据源。协议基于 JSON-RPC 2.0。

官方规范：https://spec.modelcontextprotocol.io

---

## C.1 核心消息类型

MCP 通信分三类：Client → Server 的请求、Server → Client 的响应、双向的通知。

### 初始化

Client 启动后第一件事是握手：

```json
// Client → Server: 初始化请求
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-03-26",
    "capabilities": {
      "tools": {}
    },
    "clientInfo": {
      "name": "ling",
      "version": "0.1.0"
    }
  }
}

// Server → Client: 初始化响应
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-03-26",
    "capabilities": {
      "tools": {}
    },
    "serverInfo": {
      "name": "sqlite-server",
      "version": "1.0.0"
    }
  }
}

// Client → Server: 初始化完成通知
{
  "jsonrpc": "2.0",
  "method": "notifications/initialized"
}
```

握手成功后才能调用其他方法。

### 工具相关

```json
// 列出所有工具
// Client → Server
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}

// Server → Client
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "query",
        "description": "执行 SQL 查询",
        "inputSchema": {
          "type": "object",
          "properties": {
            "sql": { "type": "string", "description": "SQL 语句" }
          },
          "required": ["sql"]
        }
      }
    ]
  }
}

// 调用工具
// Client → Server
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "query",
    "arguments": {
      "sql": "SELECT * FROM users LIMIT 10"
    }
  }
}

// Server → Client
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "id | name | email\n1 | Alice | alice@example.com\n..."
      }
    ]
  }
}
```

### 资源相关

资源（Resources）是 MCP 的另一个核心概念——Server 可以暴露只读数据源。

```json
// 列出资源
// Client → Server
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "resources/list"
}

// Server → Client
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "resources": [
      {
        "uri": "file:///data/config.json",
        "name": "应用配置",
        "mimeType": "application/json"
      }
    ]
  }
}

// 读取资源
// Client → Server
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "resources/read",
  "params": {
    "uri": "file:///data/config.json"
  }
}

// Server → Client
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "contents": [
      {
        "uri": "file:///data/config.json",
        "mimeType": "application/json",
        "text": "{\"port\": 3000, \"debug\": true}"
      }
    ]
  }
}
```

### Prompt 模板

Server 可以提供预定义的 prompt 模板：

```json
// Client → Server
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "prompts/list"
}

// Client → Server
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "prompts/get",
  "params": {
    "name": "code-review",
    "arguments": { "language": "typescript" }
  }
}
```

### 完整方法列表

| 方法 | 方向 | 用途 |
|------|------|------|
| `initialize` | Client → Server | 握手，交换能力和版本 |
| `notifications/initialized` | Client → Server | 确认初始化完成 |
| `tools/list` | Client → Server | 获取工具列表 |
| `tools/call` | Client → Server | 调用工具 |
| `resources/list` | Client → Server | 获取资源列表 |
| `resources/read` | Client → Server | 读取资源内容 |
| `resources/subscribe` | Client → Server | 订阅资源变更 |
| `prompts/list` | Client → Server | 获取 prompt 模板列表 |
| `prompts/get` | Client → Server | 获取 prompt 模板内容 |
| `notifications/tools/list_changed` | Server → Client | 工具列表变更通知 |
| `notifications/resources/list_changed` | Server → Client | 资源列表变更通知 |
| `ping` | 双向 | 心跳检测 |

---

## C.2 传输协议

MCP 支持两种传输方式。

### stdio（标准输入输出）

最常用的方式。Client 启动 Server 进程，通过 stdin/stdout 通信。

```typescript
import { spawn } from "child_process";

const server = spawn("node", ["sqlite-server.js"], {
  stdio: ["pipe", "pipe", "pipe"],
});

// 发请求：写入 stdin
server.stdin.write(JSON.stringify(request) + "\n");

// 收响应：读 stdout
server.stdout.on("data", (chunk) => {
  const response = JSON.parse(chunk.toString());
});
```

每条消息占一行（用 `\n` 分隔）。stderr 用于日志，不参与协议通信。

配置示例（`.ling.json`）：

```json
{
  "mcpServers": {
    "sqlite": {
      "command": "node",
      "args": ["sqlite-server.js", "--db", "data.db"],
      "env": { "NODE_ENV": "production" }
    }
  }
}
```

### Streamable HTTP

适合远程 Server 或需要复用连接的场景。

```
POST /mcp HTTP/1.1
Content-Type: application/json

{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
```

响应可以是普通 JSON，也可以是 SSE 流（用于长时间运行的工具调用）。

配置示例：

```json
{
  "mcpServers": {
    "remote-db": {
      "url": "https://mcp.example.com/db",
      "headers": {
        "Authorization": "Bearer xxx"
      }
    }
  }
}
```

### 如何选择

| 场景 | 推荐传输 | 原因 |
|------|---------|------|
| 本地工具 | stdio | 简单，无需网络 |
| 远程服务 | HTTP | 跨网络，可复用连接 |
| Docker 容器 | stdio | 通过 `docker exec` 桥接 |
| 云端部署 | HTTP | 必须走网络 |

---

## C.3 常用社区 MCP Server

以下是写作时最常用的 10 个社区 Server，可直接在 Ling 或 Claude Code 中配置使用。

| Server | 用途 | 仓库 |
|--------|------|------|
| **filesystem** | 文件系统操作（沙盒化） | `@modelcontextprotocol/server-filesystem` |
| **sqlite** | SQLite 数据库查询和管理 | `@modelcontextprotocol/server-sqlite` |
| **postgres** | PostgreSQL 数据库查询 | `@modelcontextprotocol/server-postgres` |
| **github** | GitHub API 操作（issue/PR/repo） | `@modelcontextprotocol/server-github` |
| **slack** | Slack 消息读写、频道管理 | `@modelcontextprotocol/server-slack` |
| **puppeteer** | 浏览器自动化（截图/爬取） | `@modelcontextprotocol/server-puppeteer` |
| **fetch** | HTTP 请求，网页转 Markdown | `@modelcontextprotocol/server-fetch` |
| **memory** | 持久化知识图谱（实体/关系） | `@modelcontextprotocol/server-memory` |
| **brave-search** | Brave 搜索引擎集成 | `@modelcontextprotocol/server-brave-search` |
| **sequential-thinking** | 结构化推理（思维链辅助） | `@modelcontextprotocol/server-sequential-thinking` |

安装方式统一：

```bash
# 以 sqlite 为例
npx @modelcontextprotocol/server-sqlite --db-path ./data.db
```

或者在配置文件中声明，让 Ling 自动启动：

```json
{
  "mcpServers": {
    "sqlite": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sqlite", "--db-path", "./data.db"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxx" }
    }
  }
}
```

更多 Server 参见官方目录：https://github.com/modelcontextprotocol/servers
