import { glob } from "glob";
import type { Tool } from "./types.js";

export const globTool: Tool = {
  name: "glob",
  description: "Find files matching a glob pattern. Returns a list of matching file paths.",
  schema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Glob pattern, e.g. 'src/**/*.ts'" },
      cwd: { type: "string", description: "Base directory (default: .)" },
    },
    required: ["pattern"],
  },
  async execute(params) {
    const pattern = params.pattern as string;
    const cwd = (params.cwd as string) ?? ".";

    const files = await glob(pattern, { cwd, nodir: true });
    if (files.length === 0) return "No files matched.";
    return files.sort().join("\n");
  },
};
