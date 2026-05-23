// 输出格式化——text / json / stream

export type OutputFormat = "text" | "json" | "stream";

/** text 格式：直接打印，人类可读 */
function writeText(content: string): void {
  process.stdout.write(content + "\n");
}

/** json 格式：整个结果包成一个 JSON 对象 */
function writeJson(result: {
  content: string;
  model: string;
  turns: number;
  structured_output?: unknown;
}): void {
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

/** stream 格式：每行一个 JSON 事件，NDJSON */
export function writeStreamEvent(event: StreamEvent): void {
  process.stdout.write(JSON.stringify(event) + "\n");
}

// 流式事件类型
export interface StreamEvent {
  type: "start" | "text_delta" | "tool_use" | "tool_result" | "end" | "error";
  content?: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: string;
  model?: string;
  turns?: number;
}

/** 根据 format 选择输出方式 */
export function writeOutput(
  format: OutputFormat,
  result: {
    content: string;
    model: string;
    turns: number;
    structured_output?: unknown;
  }
): void {
  switch (format) {
    case "text":
      writeText(result.content);
      break;
    case "json":
      writeJson(result);
      break;
    case "stream":
      // stream 模式下，最终结果也以 end 事件输出
      writeStreamEvent({
        type: "end",
        content: result.content,
        model: result.model,
        turns: result.turns,
      });
      break;
  }
}
