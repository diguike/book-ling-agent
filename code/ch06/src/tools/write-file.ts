import { writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import type { Tool } from "./types.js";

export const writeFileTool: Tool = {
  name: "write_file",
  description: "Create or overwrite a file with the given content. Parent directories are created automatically.",
  schema: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "Absolute path to write" },
      content: { type: "string", description: "File content" },
    },
    required: ["file_path", "content"],
  },
  async execute(params) {
    const filePath = params.file_path as string;
    const content = params.content as string;

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf-8");
    return `File written: ${filePath} (${content.length} bytes)`;
  },
};
