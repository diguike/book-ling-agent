// 流式输出的统一抽象类型
// 不管底层是 OpenAI、Claude 还是火山引擎，都转成这套 StreamChunk

/** 流式数据块类型 */
export type StreamChunkType =
  | "text"             // 普通文本 token
  | "tool_call_start"  // 工具调用开始（携带工具名和 id）
  | "tool_call_delta"  // 工具调用参数的增量片段
  | "tool_call_end"    // 工具调用结束
  | "finish";          // 整个响应结束

/** 统一的流式数据块 */
export interface StreamChunk {
  type: StreamChunkType;
  content: string;            // text 类型时是文字内容，tool_call_delta 时是参数 JSON 片段
  toolCallId?: string;        // 工具调用的唯一 ID
  toolName?: string;          // 仅在 tool_call_start 时出现
  index?: number;             // 同一响应中第几个工具调用（支持并行调用）
}

/** 收集完成的工具调用 */
export interface CollectedToolCall {
  id: string;
  name: string;
  arguments: string;          // 完整的 JSON 字符串
}
