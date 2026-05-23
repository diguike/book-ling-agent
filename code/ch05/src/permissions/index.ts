export type { PermissionRule, PermissionConfig, PermissionResult, PermissionAction, ToolCallContext } from "./types.js";
export { evaluate, extractPrimaryArg } from "./matcher.js";
export { PermissionGuard } from "./guard.js";
export { loadPermissionConfig } from "./config.js";
export { defaultRules, defaultProtectedPaths } from "./defaults.js";
