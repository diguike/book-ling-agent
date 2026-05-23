// src/agents/worktree.ts — Git Worktree 隔离
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

export function createWorktree(branchName: string): string {
  const wtPath = `/tmp/ling-worktree-${randomUUID()}`;
  try {
    execSync(`git worktree add ${wtPath} -b ${branchName}`, {
      stdio: "pipe",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to create worktree "${branchName}": ${msg}`);
  }
  return wtPath;
}

export function removeWorktree(
  wtPath: string,
  branchName: string,
): void {
  try {
    execSync(`git worktree remove ${wtPath} --force`, { stdio: "pipe" });
  } catch {
    /* worktree may already be removed */
  }
  try {
    execSync(`git branch -D ${branchName}`, { stdio: "pipe" });
  } catch {
    /* branch may already be deleted */
  }
}

export async function withWorktree<T>(
  branchName: string,
  fn: (cwd: string) => Promise<T>,
): Promise<T> {
  const wtPath = createWorktree(branchName);
  try {
    return await fn(wtPath);
  } finally {
    removeWorktree(wtPath, branchName);
  }
}
