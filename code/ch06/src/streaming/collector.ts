// 流式 tool_call 片段收集器
// 流式 API 把一次工具调用的 JSON 参数拆成 N 个小片段发过来
// Collector 的工作：把碎片拼回完整的调用

import type { StreamChunk, CollectedToolCall } from "./types.js";

export class ToolCallCollector {
  // 按 index 暂存正在收集的调用
  private pending = new Map<
    number,
    { id: string; name: string; argChunks: string[] }
  >();

  // 收集完毕的调用队列
  private completed: CollectedToolCall[] = [];

  /** 喂入一个 chunk，返回是否有新的调用收集完成 */
  feed(chunk: StreamChunk): boolean {
    const idx = chunk.index ?? 0;

    switch (chunk.type) {
      case "tool_call_start": {
        this.pending.set(idx, {
          id: chunk.toolCallId ?? `call_${idx}`,
          name: chunk.toolName ?? "unknown",
          argChunks: [],
        });
        return false;
      }

      case "tool_call_delta": {
        const entry = this.pending.get(idx);
        if (entry) {
          entry.argChunks.push(chunk.content);
        }
        return false;
      }

      case "tool_call_end": {
        const entry = this.pending.get(idx);
        if (entry) {
          this.completed.push({
            id: entry.id,
            name: entry.name,
            arguments: entry.argChunks.join(""),
          });
          this.pending.delete(idx);
          return true;
        }
        return false;
      }

      default:
        return false;
    }
  }

  /** 取出所有已收集完成的调用并清空队列 */
  drain(): CollectedToolCall[] {
    const result = [...this.completed];
    this.completed = [];
    return result;
  }

  /** 是否还有正在收集中的调用 */
  hasPending(): boolean {
    return this.pending.size > 0;
  }

  /** 重置状态 */
  reset(): void {
    this.pending.clear();
    this.completed = [];
  }
}
