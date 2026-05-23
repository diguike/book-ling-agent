// Session 和 Memory 的类型定义

import type OpenAI from "openai";

/** 对话消息——直接复用 OpenAI 的类型 */
export type Message = OpenAI.ChatCompletionMessageParam;

/** 一次完整的对话会话 */
export interface Session {
  id: string;
  name?: string;
  messages: Message[];
  metadata: SessionMetadata;
  createdAt: number;  // Unix 时间戳
  updatedAt: number;
}

/** 会话的元信息——记录"在哪个环境下"发生的对话 */
export interface SessionMetadata {
  cwd: string;          // 工作目录
  provider: string;     // LLM 提供商
  model: string;        // 模型名
  gitBranch?: string;   // 当前 git 分支
}

/** 会话列表项——不包含完整消息，用于 list 展示 */
export interface SessionSummary {
  id: string;
  name?: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  metadata: SessionMetadata;
  /** 最后一条用户消息的前 80 个字符，方便识别 */
  lastUserMessage?: string;
}

// ---- Memory 相关 ----

/** 记忆类型 */
export type MemoryType = "user" | "project" | "feedback";

/** 一条记忆 */
export interface MemoryEntry {
  name: string;           // 记忆标题
  description: string;    // 一句话说明
  type: MemoryType;
  content: string;        // 正文内容（Markdown）
  createdAt: number;
  updatedAt: number;
}

/** 记忆索引文件中的条目 */
export interface MemoryIndexEntry {
  file: string;           // 文件名
  name: string;
  description: string;
  type: MemoryType;
}
