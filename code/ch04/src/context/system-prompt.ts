// System Prompt 构建器：分层组装上下文

import { detectProject, type ProjectInfo } from "./project-detector.js";
import { loadLingMd, type LingMdResult } from "./ling-md.js";

export interface SystemPromptOptions {
  cwd: string;
  customRules?: string; // 用户额外追加的规则
}

// 第一层：角色定义
const LAYER_ROLE = `You are Ling, a coding assistant built for real projects.
You can read files, run commands, search code, and edit files.
You think step by step, use tools to gather information before answering, and verify your work.`;

// 第二层：通用规则
const LAYER_RULES = `## Rules
- Always read the relevant file before editing it.
- Never run destructive commands (rm -rf /, git push --force) without explicit user confirmation.
- When you make an error, acknowledge it and try a different approach.
- Keep responses concise — code speaks louder than paragraphs.
- If a task is ambiguous, ask the user to clarify instead of guessing.`;

// 第三层：从项目实际状态动态生成
function buildProjectLayer(project: ProjectInfo): string {
  const parts: string[] = ["## Project Context"];

  parts.push(`Working directory: ${project.name}`);
  parts.push(`Type: ${project.type} (${project.techStack.join(", ")})`);

  if (project.description) {
    parts.push(`Description: ${project.description}`);
  }

  parts.push("");
  parts.push("### Git Status");
  parts.push("```");
  parts.push(project.gitStatus);
  parts.push("```");

  if (project.recentCommits) {
    parts.push("");
    parts.push("### Recent Commits");
    parts.push("```");
    parts.push(project.recentCommits);
    parts.push("```");
  }

  parts.push("");
  parts.push("### Directory Structure");
  parts.push("```");
  parts.push(project.directoryTree);
  parts.push("```");

  return parts.join("\n");
}

// 第四层：.ling.md 用户指令
function buildLingMdLayer(lingMds: LingMdResult[]): string {
  if (lingMds.length === 0) return "";

  const parts: string[] = ["## Project Instructions (from .ling.md)"];
  for (const md of lingMds) {
    parts.push(`<!-- source: ${md.path} -->`);
    parts.push(md.content);
    parts.push("");
  }
  return parts.join("\n");
}

// 组装完整 System Prompt
export function buildSystemPrompt(options: SystemPromptOptions): string {
  const project = detectProject(options.cwd);
  const lingMds = loadLingMd(options.cwd);

  const sections = [
    LAYER_ROLE,
    LAYER_RULES,
    buildProjectLayer(project),
    buildLingMdLayer(lingMds),
  ];

  if (options.customRules) {
    sections.push(`## Additional Rules\n${options.customRules}`);
  }

  return sections.filter(Boolean).join("\n\n");
}

// Token 预算管理
export function estimateTokens(text: string): number {
  // 粗略估算：1 token ≈ 4 个字符（英文），中文约 1.5 字符/token
  // 这里用保守估计
  return Math.ceil(text.length / 4);
}

export interface TokenBudget {
  total: number;        // 模型上下文窗口大小
  systemPrompt: number; // system prompt 占用
  tools: number;        // 工具定义占用
  history: number;      // 历史消息占用
  reserved: number;     // 留给工具返回结果的空间
  available: number;    // 剩余可用
}

export function calculateBudget(
  contextWindow: number,
  systemPrompt: string,
  toolDefs: string,
  history: string,
): TokenBudget {
  const systemPromptTokens = estimateTokens(systemPrompt);
  const toolTokens = estimateTokens(toolDefs);
  const historyTokens = estimateTokens(history);
  // 留 30% 给工具返回结果
  const reserved = Math.floor(contextWindow * 0.3);
  const available = contextWindow - systemPromptTokens - toolTokens - historyTokens - reserved;

  return {
    total: contextWindow,
    systemPrompt: systemPromptTokens,
    tools: toolTokens,
    history: historyTokens,
    reserved,
    available: Math.max(0, available),
  };
}
