// src/agents/index.ts — 统一导出

export type {
  SubAgentConfig,
  SubAgentResult,
  ToolEntry,
  ToolRegistry,
} from "./types.js";

export { AgentSpawner } from "./spawner.js";
export { planAgent, codeAgent, reviewAgent } from "./roles.js";
export {
  runParallel,
  runSequential,
  summarizeResults,
} from "./scheduler.js";
export type { SchedulerTask } from "./scheduler.js";
export { createWorktree, removeWorktree, withWorktree } from "./worktree.js";
