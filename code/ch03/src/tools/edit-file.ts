import { readFile, writeFile } from "fs/promises";
import type { Tool } from "./types.js";

export const editFileTool: Tool = {
  name: "edit_file",
  description: "Replace an exact string in a file. old_string must appear exactly once (unless replace_all is true). Fails if not found or ambiguous.",
  schema: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "Absolute path to the file" },
      old_string: { type: "string", description: "Exact text to find" },
      new_string: { type: "string", description: "Replacement text" },
      replace_all: { type: "boolean", description: "Replace all occurrences (default: false)" },
    },
    required: ["file_path", "old_string", "new_string"],
  },
  async execute(params) {
    const filePath = params.file_path as string;
    const oldStr = params.old_string as string;
    const newStr = params.new_string as string;
    const replaceAll = (params.replace_all as boolean) ?? false;

    const content = await readFile(filePath, "utf-8");
    const count = content.split(oldStr).length - 1;
    if (count === 0) return `Error: old_string not found in ${filePath}`;
    if (count > 1 && !replaceAll) return `Error: old_string found ${count} times. Use replace_all or provide more context.`;

    const updated = replaceAll ? content.replaceAll(oldStr, newStr) : content.replace(oldStr, newStr);
    await writeFile(filePath, updated, "utf-8");
    return `Edited ${filePath}: replaced ${replaceAll ? count : 1} occurrence(s)`;
  },
};
