import { readFile } from "fs/promises";
import type { Tool } from "./types.js";

export const readFileTool: Tool = {
  name: "read_file",
  description: "Read a file and return its content with line numbers. Supports offset and limit for reading specific ranges.",
  schema: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "Absolute path to the file" },
      offset: { type: "number", description: "Start line (1-based, default: 1)" },
      limit: { type: "number", description: "Max lines to read (default: all)" },
    },
    required: ["file_path"],
  },
  async execute(params) {
    const filePath = params.file_path as string;
    const offset = (params.offset as number) ?? 1;
    const limit = params.limit as number | undefined;

    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n");
    const start = Math.max(0, offset - 1);
    const end = limit ? start + limit : lines.length;
    const slice = lines.slice(start, end);

    return slice
      .map((line, i) => `${String(start + i + 1).padStart(4)}\t${line}`)
      .join("\n");
  },
};
