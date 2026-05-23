/** 权限动作：deny 最高优先 → ask 需确认 → allow 放行 */
export type PermissionAction = "deny" | "ask" | "allow";

/** 单条权限规则 */
export interface PermissionRule {
  tool: string; // 工具名，支持通配符 "*"
  pattern?: string; // glob 模式，匹配工具参数（命令、文件路径等）
  action: PermissionAction;
  reason?: string; // 可选：给用户看的拒绝/确认理由
}

/** 权限配置文件结构 */
export interface PermissionConfig {
  rules: PermissionRule[];
  /** 项目根目录——Agent 不能越界操作 */
  projectRoot?: string;
  /** 受保护目录，始终需要确认 */
  protectedPaths?: string[];
}

/** 权限评估结果 */
export interface PermissionResult {
  action: PermissionAction;
  rule?: PermissionRule; // 命中了哪条规则
  reason?: string;
}

/** 工具调用上下文——权限守卫需要的信息 */
export interface ToolCallContext {
  toolName: string;
  params: Record<string, unknown>;
  /** 从参数中提取的关键值（命令字符串、文件路径等） */
  primaryArg: string;
}
