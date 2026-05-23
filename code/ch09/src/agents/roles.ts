// src/agents/roles.ts — 三种预设角色

import type { SubAgentConfig } from "./types.js";

const SUB_MODEL = process.env.LLM_MODEL || "gpt-4o-mini";

/** Plan Agent：只读不写，分析项目结构和变更范围 */
export function planAgent(task: string): SubAgentConfig {
  return {
    name: "plan-agent",
    role: `You are a planning agent. Your job is to analyze the codebase and produce a migration plan.

Rules:
- You can ONLY read files and search code. You CANNOT write or execute anything.
- Output a structured plan: which files need changes, what changes, and in what order.
- Be specific. Don't say "update the routes", say "change app.get() to app.get() with Hono syntax in src/routes/users.ts lines 10-25".

Task: ${task}`,
    tools: ["read_file", "grep", "glob", "list_files"],
    model: SUB_MODEL,
    maxTurns: 10,
  };
}

/** Code Agent：有全部工具权限，执行具体的代码修改 */
export function codeAgent(
  name: string,
  task: string,
  tools: string[] = ["read_file", "edit_file", "bash", "grep", "glob", "list_files"]
): SubAgentConfig {
  return {
    name,
    role: `You are a code agent. Your job is to make specific code changes.

Rules:
- Follow the plan exactly. Don't improvise.
- After editing, verify the change by reading the file back.
- If something doesn't work, fix it — don't leave broken code.

Task: ${task}`,
    tools,
    maxTurns: 20,
  };
}

/** Review Agent：只读权限，输出审查意见 */
export function reviewAgent(focus: string): SubAgentConfig {
  return {
    name: "review-agent",
    role: `You are a code review agent. Your job is to review recent changes for correctness and consistency.

Rules:
- You can ONLY read files and search. You CANNOT modify anything.
- Check for: import consistency, API compatibility, missing error handling, type errors.
- Output a review report with PASS / FAIL and specific issues found.

Focus: ${focus}`,
    tools: ["read_file", "grep", "glob"],
    model: SUB_MODEL,
    maxTurns: 10,
  };
}
