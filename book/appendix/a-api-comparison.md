# 附录 A · 三家 LLM API 对比速查表

这份速查表覆盖火山引擎（豆包）、Claude、OpenAI 三家的 API 差异。写 Provider 适配层时直接翻这里。

---

## A.1 请求格式对比

| 字段 | 火山引擎（OpenAI 兼容） | Anthropic Claude | OpenAI |
|------|------------------------|-----------------|--------|
| 端点 | `POST /api/v3/chat/completions` | `POST /v1/messages` | `POST /v1/chat/completions` |
| 认证 | `Authorization: Bearer {api_key}` | `x-api-key: {api_key}` | `Authorization: Bearer {api_key}` |
| 模型字段 | `model` | `model` | `model` |
| 消息格式 | `messages: [{role, content}]` | `messages: [{role, content}]` | `messages: [{role, content}]` |
| System Prompt | `messages[0].role = "system"` | 顶层 `system` 字段 | `messages[0].role = "system"` |
| 最大输出 | `max_tokens`（可选） | `max_tokens`（必填） | `max_tokens`（可选） |
| 工具定义 | `tools: [{type, function}]` | `tools: [{name, description, input_schema}]` | `tools: [{type, function}]` |
| 温度 | `temperature: 0-2` | `temperature: 0-1` | `temperature: 0-2` |
| 流式 | `stream: true` | `stream: true` | `stream: true` |

关键差异：**Claude 的 system prompt 不在 messages 数组里**，是一个独立的顶层字段。这是写 Provider 适配时最容易踩的坑。另外 Claude 的 `max_tokens` 是必填的，不传会报错。

---

## A.2 Tool Call 格式对比

### 火山引擎 / OpenAI（格式相同）

请求中的工具定义：

```json
{
  "tools": [{
    "type": "function",
    "function": {
      "name": "read_file",
      "description": "读取文件内容",
      "parameters": {
        "type": "object",
        "properties": {
          "file_path": { "type": "string", "description": "文件路径" }
        },
        "required": ["file_path"]
      }
    }
  }]
}
```

LLM 返回的 tool call：

```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": null,
      "tool_calls": [{
        "id": "call_abc123",
        "type": "function",
        "function": {
          "name": "read_file",
          "arguments": "{\"file_path\": \"package.json\"}"
        }
      }]
    },
    "finish_reason": "tool_calls"
  }]
}
```

注意 `arguments` 是**字符串**，不是对象。需要 `JSON.parse()` 一次。

回传工具结果：

```json
{
  "messages": [
    {"role": "user", "content": "读一下 package.json"},
    {"role": "assistant", "content": null, "tool_calls": [{"id": "call_abc123", ...}]},
    {"role": "tool", "tool_call_id": "call_abc123", "content": "{\"name\": \"my-app\"}"}
  ]
}
```

### Anthropic Claude

请求中的工具定义：

```json
{
  "tools": [{
    "name": "read_file",
    "description": "读取文件内容",
    "input_schema": {
      "type": "object",
      "properties": {
        "file_path": { "type": "string", "description": "文件路径" }
      },
      "required": ["file_path"]
    }
  }]
}
```

差异：没有外层的 `type: "function"` 和 `function` 嵌套，直接平铺。`parameters` 改名为 `input_schema`。

LLM 返回的 tool call：

```json
{
  "content": [
    {"type": "text", "text": "我来读一下这个文件。"},
    {
      "type": "tool_use",
      "id": "toolu_abc123",
      "name": "read_file",
      "input": {"file_path": "package.json"}
    }
  ],
  "stop_reason": "tool_use"
}
```

差异：`input` 是**对象**，不是字符串——不需要额外 parse。Claude 的 content 是数组，可以同时包含文本和工具调用。

回传工具结果：

```json
{
  "messages": [
    {"role": "user", "content": "读一下 package.json"},
    {"role": "assistant", "content": [{"type": "tool_use", "id": "toolu_abc123", ...}]},
    {"role": "user", "content": [
      {"type": "tool_result", "tool_use_id": "toolu_abc123", "content": "{\"name\": \"my-app\"}"}
    ]}
  ]
}
```

差异：工具结果的 role 是 `user`（不是 `tool`），包在 `tool_result` 类型的 content block 里。

---

## A.3 流式格式对比

### 火山引擎 / OpenAI（SSE 格式相同）

```
data: {"choices":[{"delta":{"role":"assistant"},"index":0}]}

data: {"choices":[{"delta":{"content":"你"},"index":0}]}

data: {"choices":[{"delta":{"content":"好"},"index":0}]}

data: {"choices":[{"delta":{},"finish_reason":"stop","index":0}]}

data: [DONE]
```

工具调用的流式：

```
data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_abc","function":{"name":"read_file","arguments":""}}]}}]}

data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"file"}}]}}]}

data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"_path\": \"pkg.json\"}"}}]}}]}
```

`arguments` 是逐步拼接的字符串碎片，需要收集完整后 `JSON.parse()`。

### Anthropic Claude（SSE 格式）

```
event: message_start
data: {"type":"message_start","message":{"id":"msg_abc","model":"claude-sonnet-4-20250514","role":"assistant"}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}

event: message_stop
data: {"type":"message_stop"}
```

差异：Claude 用 `event` 字段区分事件类型，结构更清晰。有明确的 `content_block_start` / `content_block_stop` 边界。OpenAI 格式全靠 `delta` 里有没有字段来判断状态。

---

## A.4 错误处理对比

| 场景 | 火山引擎 | Anthropic Claude | OpenAI |
|------|---------|-----------------|--------|
| 认证失败 | 401 `{"error": {"message": "...", "code": "Unauthorized"}}` | 401 `{"type": "error", "error": {"type": "authentication_error"}}` | 401 `{"error": {"message": "...", "type": "invalid_request_error"}}` |
| 限流 | 429 + `Retry-After` header | 429 + `retry-after` header | 429 + `Retry-After` header |
| Token 超限 | 400 `context_length_exceeded` | 400 `invalid_request_error` | 400 `context_length_exceeded` |
| 服务器错误 | 500/502/503 | 500/529（overloaded） | 500/502/503 |

处理建议：

- **429 限流**：读 `Retry-After` header，等待指定秒数后重试。没有 header 就用指数退避（1s → 2s → 4s）。
- **529 过载**（Claude 特有）：和 429 一样处理，但等待时间建议更长（5s 起步）。
- **500 系列**：最多重试 3 次，每次间隔翻倍。超过 3 次就抛错给用户。
- **Token 超限**：不要重试，用 compactor 压缩上下文后再发。

---

## A.5 计费方式

| 项目 | 火山引擎（豆包） | Anthropic Claude | OpenAI |
|------|-----------------|-----------------|--------|
| 计费单位 | Token | Token | Token |
| 输入价格（旗舰模型） | ~¥0.8/百万 token | $3/百万 token（Sonnet） | $2.5/百万 token（GPT-4o） |
| 输出价格（旗舰模型） | ~¥2/百万 token | $15/百万 token（Sonnet） | $10/百万 token（GPT-4o） |
| 免费额度 | 新用户赠送 | 无 | 无 |
| 上下文窗口 | 32k-256k | 200k | 128k |
| 缓存折扣 | 无 | Prompt caching 减 90% | 无 |
| 批量折扣 | 无 | Batch API 减 50% | Batch API 减 50% |

注意：价格经常变动，以官方最新定价为准。上面的数字是写作时的参考值。

国内使用豆包做日常开发（速度快、便宜），需要强推理时切 Claude（贵但聪明），这是性价比最高的组合。

---

## A.6 国内可用性

| 项目 | 火山引擎 | Anthropic Claude | OpenAI |
|------|---------|-----------------|--------|
| 直连 | 可以 | 不可以 | 不可以 |
| API 端点 | `ark.cn-beijing.volces.com` | `api.anthropic.com` | `api.openai.com` |
| 注册要求 | 国内手机号 + 实名 | 海外手机号 | 海外手机号 |
| 支付 | 支付宝/微信 | 信用卡（Visa/Master） | 信用卡（Visa/Master） |
| 替代方案 | — | 中转 API / 云函数代理 | 中转 API / Azure OpenAI |

实际开发建议：

1. **本地开发**：默认用豆包，零配置直连。
2. **需要 Claude/OpenAI**：搭一个简单的代理服务（Cloudflare Worker 或者 Vercel Edge Function），把请求转发到官方 API。代码量 20 行。
3. **企业环境**：Azure OpenAI 有国内区域（`chinaeast2`），走正规渠道申请。火山引擎有企业套餐。

这也是我们在第 2 章把 Provider 做成可插拔架构的原因——网络环境变了，换个 Provider 就行，上层代码一行不改。
