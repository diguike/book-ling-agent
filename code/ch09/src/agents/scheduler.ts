// src/agents/scheduler.ts — 并行调度器

import type { SubAgentConfig, SubAgentResult } from "./types.js";
import type { AgentSpawner } from "./spawner.js";

export interface SchedulerTask {
  config: SubAgentConfig;
  task: string;
}

/**
 * 并行运行多个子 Agent，等待全部完成。
 * 本质上就是 Promise.all —— 但加了日志、超时和结果聚合。
 */
export async function runParallel(
  spawner: AgentSpawner,
  tasks: SchedulerTask[],
  options: { timeoutMs?: number } = {}
): Promise<SubAgentResult[]> {
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000; // 默认 5 分钟

  console.log(`\n[scheduler] Running ${tasks.length} agents in parallel...`);
  const startTime = Date.now();

  // 给每个任务加上超时
  const promises = tasks.map(({ config, task }) => {
    return Promise.race([
      spawner.spawn(config, task),
      timeout(timeoutMs, config.name),
    ]);
  });

  const results = await Promise.all(promises);

  const elapsed = Date.now() - startTime;
  const succeeded = results.filter((r) => r.success).length;
  console.log(
    `\n[scheduler] Done. ${succeeded}/${results.length} succeeded in ${elapsed}ms`
  );

  return results;
}

/** 串行运行：一个接一个，前一个的输出可以传给下一个 */
export async function runSequential(
  spawner: AgentSpawner,
  tasks: SchedulerTask[]
): Promise<SubAgentResult[]> {
  console.log(`\n[scheduler] Running ${tasks.length} agents sequentially...`);
  const results: SubAgentResult[] = [];

  for (const { config, task } of tasks) {
    const result = await spawner.spawn(config, task);
    results.push(result);

    // 如果某个子 Agent 失败了，后续的可能也没意义
    if (!result.success) {
      console.log(`[scheduler] ${config.name} failed, stopping pipeline.`);
      break;
    }
  }

  return results;
}

/** 超时 helper */
function timeout(ms: number, name: string): Promise<SubAgentResult> {
  return new Promise((resolve) =>
    setTimeout(
      () =>
        resolve({
          name,
          success: false,
          output: "",
          turns: 0,
          durationMs: ms,
          error: `Timeout after ${ms}ms`,
        }),
      ms
    )
  );
}

/** 把多个子 Agent 的结果聚合成一段给用户看的摘要 */
export function summarizeResults(results: SubAgentResult[]): string {
  const lines: string[] = ["## Sub-Agent Results\n"];

  for (const r of results) {
    const status = r.success ? "OK" : "FAILED";
    lines.push(`### ${r.name} [${status}] (${r.turns} turns, ${r.durationMs}ms)`);
    if (r.error) {
      lines.push(`Error: ${r.error}`);
    }
    lines.push(r.output);
    lines.push("");
  }

  return lines.join("\n");
}
