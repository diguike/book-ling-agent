import { exec } from "child_process";
import { promisify } from "util";
import type { Tool } from "./types.js";

const execAsync = promisify(exec);

export const bashTool: Tool = {
  name: "bash",
  description: "Execute a shell command. Returns stdout and stderr. Use for git, npm, build commands, etc.",
  schema: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command to run" },
      timeout: { type: "number", description: "Timeout in ms (default: 30000)" },
    },
    required: ["command"],
  },
  async execute(params) {
    const command = params.command as string;
    const timeout = (params.timeout as number) ?? 30_000;

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        maxBuffer: 1024 * 1024,
      });
      let result = "";
      if (stdout) result += stdout.trimEnd();
      if (stderr) result += (result ? "\n[stderr]\n" : "") + stderr.trimEnd();
      return result || "(no output)";
    } catch (err: unknown) {
      const e = err as { killed?: boolean; stdout?: string; stderr?: string; message: string };
      if (e.killed) return `Error: command timed out after ${timeout}ms`;
      return `Error: ${e.stderr || e.message}`;
    }
  },
};
