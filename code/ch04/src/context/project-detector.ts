// 项目类型检测：启动时扫描工作目录，生成项目上下文

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { execSync } from "child_process";
import { join, basename } from "path";

export interface ProjectInfo {
  type: string;           // "nodejs" | "go" | "python" | "unknown"
  name: string;           // 项目名
  description: string;    // 一句话描述
  techStack: string[];    // 技术栈关键词
  gitStatus: string;      // git status 摘要
  recentCommits: string;  // 最近 5 条 commit
  directoryTree: string;  // 目录结构
}

// 检测规则：文件 → 项目类型
const DETECTION_RULES: { file: string; type: string; parser: (cwd: string) => Partial<ProjectInfo> }[] = [
  {
    file: "package.json",
    type: "nodejs",
    parser: (cwd) => {
      const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf-8"));
      const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
      const techStack: string[] = ["Node.js"];
      if (deps.includes("react")) techStack.push("React");
      if (deps.includes("vue")) techStack.push("Vue");
      if (deps.includes("next")) techStack.push("Next.js");
      if (deps.includes("express")) techStack.push("Express");
      if (deps.includes("typescript")) techStack.push("TypeScript");
      return { name: pkg.name || basename(cwd), description: pkg.description || "", techStack };
    },
  },
  {
    file: "go.mod",
    type: "go",
    parser: (cwd) => {
      const content = readFileSync(join(cwd, "go.mod"), "utf-8");
      const moduleLine = content.split("\n").find((l) => l.startsWith("module "));
      const name = moduleLine?.replace("module ", "").trim() || basename(cwd);
      return { name, techStack: ["Go"] };
    },
  },
  {
    file: "requirements.txt",
    type: "python",
    parser: (cwd) => {
      const deps = readFileSync(join(cwd, "requirements.txt"), "utf-8").split("\n").filter(Boolean);
      const techStack: string[] = ["Python"];
      if (deps.some((d) => d.startsWith("django"))) techStack.push("Django");
      if (deps.some((d) => d.startsWith("flask"))) techStack.push("Flask");
      if (deps.some((d) => d.startsWith("fastapi"))) techStack.push("FastAPI");
      return { name: basename(cwd), techStack };
    },
  },
  {
    file: "pyproject.toml",
    type: "python",
    parser: (cwd) => ({ name: basename(cwd), techStack: ["Python"] }),
  },
];

function getGitInfo(cwd: string): { gitStatus: string; recentCommits: string } {
  try {
    const gitStatus = execSync("git status --short", { cwd, encoding: "utf-8", timeout: 5000 });
    const recentCommits = execSync("git log --oneline -5", { cwd, encoding: "utf-8", timeout: 5000 });
    return { gitStatus: gitStatus.trim() || "(clean)", recentCommits: recentCommits.trim() };
  } catch {
    return { gitStatus: "(not a git repo)", recentCommits: "" };
  }
}

function getDirectoryTree(cwd: string, maxDepth = 2, prefix = ""): string {
  const IGNORE = new Set(["node_modules", ".git", "dist", "build", "__pycache__", ".next", "vendor"]);
  const lines: string[] = [];

  function walk(dir: string, depth: number, indent: string) {
    if (depth > maxDepth) return;
    const entries = readdirSync(dir).filter((e) => !IGNORE.has(e)).sort();
    for (const entry of entries.slice(0, 20)) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      lines.push(`${indent}${entry}${stat.isDirectory() ? "/" : ""}`);
      if (stat.isDirectory()) walk(fullPath, depth + 1, indent + "  ");
    }
    if (entries.length > 20) lines.push(`${indent}... (${entries.length - 20} more)`);
  }

  walk(cwd, 0, prefix);
  return lines.join("\n");
}

export function detectProject(cwd: string): ProjectInfo {
  // 依次检测，命中第一个就停
  for (const rule of DETECTION_RULES) {
    if (existsSync(join(cwd, rule.file))) {
      const partial = rule.parser(cwd);
      const git = getGitInfo(cwd);
      return {
        type: rule.type,
        name: partial.name || basename(cwd),
        description: partial.description || "",
        techStack: partial.techStack || [],
        directoryTree: getDirectoryTree(cwd),
        ...git,
      };
    }
  }

  // 没命中任何规则
  const git = getGitInfo(cwd);
  return {
    type: "unknown",
    name: basename(cwd),
    description: "",
    techStack: [],
    directoryTree: getDirectoryTree(cwd),
    ...git,
  };
}
