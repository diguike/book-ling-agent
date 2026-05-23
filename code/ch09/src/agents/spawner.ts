// src/agents/spawner.ts — 子 Agent 生成器：创建独立的 Agent 实例并运行

import type { LLMProvider, Tool, Message } from "../providers/index.js";
import type { SubAgentConfig, SubAgentResult, ToolRegistry } from "./types.js";

const DEFAULT_MAX_TURNS = 15;

export class AgentSpawner {
  private provider: LLMProvider;
  private toolRegistry: ToolRegistry;

  constructor(provider: LLMProvider, toolRegistry: ToolRegistry) {
    this.provider = provider;
    this.toolRegistry = toolRegistry;
  }

  /** 启动一个子 Agent，返回其最终输出 */
  async spawn(config: SubAgentConfig, task: string): Promise<SubAgentResult> {
    const startTime = Date.now();
    const maxTurns = config.maxTurns ?? DEFAULT_MAX_TURNS;

    // 1. 从全局工具表中过滤出子 Agent 允许用的工具
    const allowedTools: Tool[] = [];
    const executors = new Map<string, (params: Record<string, unknown>) => Promise<string>>();

    for (const toolName of config.tools) {
      const entry = this.toolRegistry.get(toolName);
      if (entry) {
        allowedTools.push(entry.definition);
        executors.set(toolName, entry.execute);
      }
    }

    // 2. 独立的消息历史 —— 这是上下文隔离的关键
    const messages: Message[] = [
      { role: "system", content: config.role },
      { role: "user", content: task },
    ];

    console.log(`\n[${config.name}] Started (provider=${this.provider.name}, tools=${config.tools.join(",")})`);

    // 3. 独立的 agent loop
    let turns = 0;
    try {
      while (turns < maxTurns) {
        turns++;

        const response = await this.provider.chat(
          messages,
          allowedTools.length > 0 ? allowedTools : undefined,
        );

        // 把 assistant 消息加入历史
        messages.push({
          role: "assistant",
          content: response.content ?? "",
          toolCalls: response.toolCalls.length > 0 ? response.toolCalls : undefined,
        });

        // 没有工具调用 → 子 Agent 结束
        if (response.toolCalls.length === 0) {
          console.log(`[${config.name}] Completed in ${turns} turns`);
          return {
            name: config.name,
            success: true,
            output: response.content ?? "",
            turns,
            durationMs: Date.now() - startTime,
          };
        }

        // 执行工具调用
        for (const call of response.toolCalls) {
          const toolName = call.name;
          const params = JSON.parse(call.arguments);

          // 安全检查：子 Agent 只能用允许的工具
          const executor = executors.get(toolName);
          if (!executor) {
            messages.push({
              role: "tool",
              toolCallId: call.id,
              content: `Error: tool "${toolName}" is not allowed for this agent.`,
            });
            continue;
          }

          console.log(`[${config.name}] ${toolName}(${call.arguments.slice(0, 100)})`);

          const result = await executor(params);
          messages.push({
            role: "tool",
            toolCallId: call.id,
            content: result,
          });
        }
      }

      // 超过最大轮次
      console.log(`[${config.name}] Hit max turns (${maxTurns})`);
      return {
        name: config.name,
        success: false,
        output: "Reached maximum turns without completing.",
        turns,
        durationMs: Date.now() - startTime,
        error: `Exceeded ${maxTurns} turns`,
      };
    } catch (err) {
      return {
        name: config.name,
        success: false,
        output: "",
        turns,
        durationMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
