// Memory 模块——跨会话的长期记忆
// 存储路径：~/.ling/memory/<project-slug>/

import * as fs from "fs/promises";
import * as path from "path";
import type { MemoryEntry, MemoryIndexEntry, MemoryType } from "./types.js";

const MEMORY_BASE = path.join(process.env.HOME ?? "~", ".ling", "memory");

/** 把项目路径变成安全的目录名 */
function slugify(projectPath: string): string {
  return projectPath
    .replace(/^\//, "")
    .replace(/\//g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .toLowerCase();
}

export class MemoryStore {
  private dir: string;

  constructor(projectPath: string) {
    this.dir = path.join(MEMORY_BASE, slugify(projectPath));
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  private indexPath(): string {
    return path.join(this.dir, "MEMORY.md");
  }

  /**
   * 写入一条记忆
   * 生成独立的 .md 文件 + 更新 MEMORY.md 索引
   */
  async write(entry: MemoryEntry): Promise<string> {
    await this.ensureDir();

    // 文件名：用标题 slugify
    const fileName = entry.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      + ".md";

    // 生成带 frontmatter 的内容
    const fileContent = [
      "---",
      `name: ${entry.name}`,
      `description: ${entry.description}`,
      `type: ${entry.type}`,
      `createdAt: ${entry.createdAt}`,
      `updatedAt: ${entry.updatedAt}`,
      "---",
      "",
      entry.content,
      "",
    ].join("\n");

    await fs.writeFile(path.join(this.dir, fileName), fileContent, "utf-8");

    // 更新索引
    await this.updateIndex({ file: fileName, name: entry.name, description: entry.description, type: entry.type });

    return fileName;
  }

  /** 读取所有记忆条目（前 200 行） */
  async loadForContext(): Promise<string> {
    try {
      const indexContent = await fs.readFile(this.indexPath(), "utf-8");
      const lines = indexContent.split("\n");
      return lines.slice(0, 200).join("\n");
    } catch {
      return "";
    }
  }

  /** 读取指定记忆文件的完整内容 */
  async read(fileName: string): Promise<MemoryEntry | null> {
    try {
      const raw = await fs.readFile(path.join(this.dir, fileName), "utf-8");
      return parseFrontmatter(raw);
    } catch {
      return null;
    }
  }

  /** 列出所有记忆 */
  async list(): Promise<MemoryIndexEntry[]> {
    try {
      const content = await fs.readFile(this.indexPath(), "utf-8");
      return parseIndex(content);
    } catch {
      return [];
    }
  }

  /** 更新 MEMORY.md 索引文件 */
  private async updateIndex(entry: MemoryIndexEntry): Promise<void> {
    const entries = await this.list();

    // 去重：同名的覆盖
    const filtered = entries.filter((e) => e.file !== entry.file);
    filtered.push(entry);

    const lines = ["# Memory Index", ""];
    for (const e of filtered) {
      lines.push(`- [${e.name}](${e.file}) — ${e.description} (${e.type})`);
    }
    lines.push("");

    await fs.writeFile(this.indexPath(), lines.join("\n"), "utf-8");
  }
}

/** 从 Markdown frontmatter 解析 MemoryEntry */
function parseFrontmatter(raw: string): MemoryEntry | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;

  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }

  return {
    name: meta.name ?? "untitled",
    description: meta.description ?? "",
    type: (meta.type as MemoryType) ?? "project",
    content: match[2].trim(),
    createdAt: Number(meta.createdAt) || Date.now(),
    updatedAt: Number(meta.updatedAt) || Date.now(),
  };
}

/** 从 MEMORY.md 解析索引 */
function parseIndex(content: string): MemoryIndexEntry[] {
  const entries: MemoryIndexEntry[] = [];
  for (const line of content.split("\n")) {
    // 格式：- [name](file) — description (type)
    const m = line.match(/^- \[(.+?)]\((.+?)\) — (.+?) \((\w+)\)$/);
    if (m) {
      entries.push({ name: m[1], file: m[2], description: m[3], type: m[4] as MemoryType });
    }
  }
  return entries;
}
