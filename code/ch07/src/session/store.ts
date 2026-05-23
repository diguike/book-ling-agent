// SessionStore —— 基于文件系统的会话持久化
// 每个 session 存成一个 JSON 文件：~/.ling/sessions/<id>.json

import * as fs from "fs/promises";
import * as path from "path";
import { randomUUID } from "crypto";
import type { Session, SessionSummary, SessionMetadata, Message } from "./types.js";

const SESSIONS_DIR = path.join(
  process.env.HOME ?? "~",
  ".ling",
  "sessions"
);

export class SessionStore {
  private dir: string;

  constructor(dir: string = SESSIONS_DIR) {
    this.dir = dir;
  }

  /** 确保目录存在 */
  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  private filePath(id: string): string {
    return path.join(this.dir, `${id}.json`);
  }

  /** 创建新会话 */
  async create(metadata: SessionMetadata, name?: string): Promise<Session> {
    await this.ensureDir();

    const session: Session = {
      id: randomUUID(),
      name,
      messages: [],
      metadata,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.save(session);
    return session;
  }

  /** 保存会话（整体覆盖写入） */
  async save(session: Session): Promise<void> {
    await this.ensureDir();
    session.updatedAt = Date.now();

    const data = JSON.stringify(session, null, 2);
    // 先写临时文件再 rename——防止写到一半断电出现损坏文件
    const tmpPath = this.filePath(session.id) + ".tmp";
    await fs.writeFile(tmpPath, data, "utf-8");
    await fs.rename(tmpPath, this.filePath(session.id));
  }

  /** 加载指定会话 */
  async load(id: string): Promise<Session | null> {
    try {
      const data = await fs.readFile(this.filePath(id), "utf-8");
      return JSON.parse(data) as Session;
    } catch {
      return null;
    }
  }

  /** 列出所有会话摘要，按更新时间倒序 */
  async list(): Promise<SessionSummary[]> {
    await this.ensureDir();

    const files = await fs.readdir(this.dir);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    const summaries: SessionSummary[] = [];

    for (const file of jsonFiles) {
      try {
        const data = await fs.readFile(path.join(this.dir, file), "utf-8");
        const session = JSON.parse(data) as Session;

        // 找最后一条用户消息
        const lastUserMsg = [...session.messages]
          .reverse()
          .find((m) => m.role === "user");
        const lastContent =
          lastUserMsg && "content" in lastUserMsg
            ? String(lastUserMsg.content).slice(0, 80)
            : undefined;

        summaries.push({
          id: session.id,
          name: session.name,
          messageCount: session.messages.length,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          metadata: session.metadata,
          lastUserMessage: lastContent,
        });
      } catch {
        // 跳过损坏的文件
      }
    }

    return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** 删除会话 */
  async delete(id: string): Promise<boolean> {
    try {
      await fs.unlink(this.filePath(id));
      return true;
    } catch {
      return false;
    }
  }

  /** 获取最近的会话 ID */
  async getLatestId(): Promise<string | null> {
    const summaries = await this.list();
    return summaries.length > 0 ? summaries[0].id : null;
  }

  /** 重命名会话 */
  async rename(id: string, name: string): Promise<boolean> {
    const session = await this.load(id);
    if (!session) return false;
    session.name = name;
    await this.save(session);
    return true;
  }
}
