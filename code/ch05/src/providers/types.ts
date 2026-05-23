// LLM Provider 接口——ch05 仅需非流式调用

/** 消息角色 */
export type MessageRole = "system" | "user" | "assistant" | "tool";

/** 通用消息格式 */
export interface Message {
  role: MessageRole;
  content: string | null;
  tool_calls?: ToolCallMessage[];
  tool_call_id?: string;
}

/** 工具调用（完整的） */
export interface ToolCallMessage {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/** 工具定义（给 LLM 看的） */
export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** 非流式响应 */
export interface LLMResponse {
  content: string | null;
  toolCalls: ToolCallMessage[];
  usage?: { promptTokens: number; completionTokens: number };
}

/** LLM Provider 接口 */
export interface LLMProvider {
  name: string;

  /** 非流式调用 */
  chat(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse>;
}
