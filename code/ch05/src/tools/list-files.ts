import { readdir, stat } from "fs/promises";
import { join } from "path";
import type { Tool } from "./types.js";

export const listFilesTool: Tool = {
  name: "list_files",
  description: "List files and directories in a given path. Shows type (file/dir) and size.",
  schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Directory path (default: .)" },
    },
  },
  async execute(params) {
    const dirPath = (params.path as string) ?? ".";
    const entries = await readdir(dirPath, { withFileTypes: true });
    const lines: string[] = [];

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        lines.push(`[dir]  ${entry.name}/`);
      } else {
        const s = await stat(fullPath);
        lines.push(`[file] ${entry.name} (${s.size} bytes)`);
      }
    }
    return lines.join("\n") || "(empty directory)";
  },
};
