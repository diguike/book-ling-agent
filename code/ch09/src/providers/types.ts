// ===== 统一消息类型 =====

/** 工具定义：三家 API 都需要知道工具长什么样 */
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

/** 工具调用请求：模型说"我要调这个工具" */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string; // JSON 字符串，和 OpenAI 保持一致
}

/** 工具执行结果：我们把结果喂回去 */
export interface ToolResult {
  toolCallId: string;
  content: string;
}

/** 统一消息格式 */
export type Message =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

/** 模型返回的统一响应 */
export interface LLMResponse {
  content: string | null;
  toolCalls: ToolCall[];
  finishReason: "stop" | "tool_calls" | "length" | "unknown";
}

/** 流式返回的 chunk */
export interface StreamChunk {
  type: "text" | "tool_call_start" | "tool_call_delta" | "tool_call_end";
  content?: string;
  toolCall?: Partial<ToolCall>;
}

/** Provider 接口——所有适配器必须实现这两个方法 */
export interface LLMProvider {
  readonly name: string;
  chat(messages: Message[], tools?: Tool[]): Promise<LLMResponse>;
  stream(messages: Message[], tools?: Tool[]): AsyncIterableIterator<StreamChunk>;
}

/** Provider 配置 */
export interface ProviderConfig {
  provider: "volcano" | "claude" | "openai";
  apiKey: string;
  model: string;
  baseURL?: string;
}
