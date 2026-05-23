import { execFile } from "child_process";
import { promisify } from "util";
import type { Tool } from "./types.js";

const exec = promisify(execFile);

export const grepTool: Tool = {
  name: "grep",
  description: "Search file contents using regex pattern. Returns matching lines with file paths and line numbers.",
  schema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex pattern to search" },
      path: { type: "string", description: "Directory or file to search in (default: .)" },
      glob: { type: "string", description: "File glob filter, e.g. '*.ts'" },
    },
    required: ["pattern"],
  },
  async execute(params) {
    const pattern = params.pattern as string;
    const path = (params.path as string) ?? ".";
    const args = ["-rn", "--color=never", "-E", pattern, path];
    if (params.glob) args.splice(1, 0, `--include=${params.glob}`);

    try {
      const { stdout } = await exec("grep", args, { maxBuffer: 1024 * 1024 });
      const lines = stdout.trimEnd().split("\n");
      return lines.length > 100 ? lines.slice(0, 100).join("\n") + `\n... (${lines.length} total matches)` : stdout.trimEnd();
    } catch {
      return "No matches found.";
    }
  },
};
