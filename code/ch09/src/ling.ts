// src/ling.ts — 集成多 Agent 的主循环（第 9 章版本）

import { initProvider } from "./providers/index.js";
import type { Tool, Message } from "./providers/index.js";
import {
  AgentSpawner,
  planAgent,
  codeAgent,
  reviewAgent,
  runParallel,
  runSequential,
  summarizeResults,
} from "./agents/index.js";
import type { ToolEntry, ToolRegistry, SchedulerTask } from "./agents/index.js";

const provider = initProvider();

// ---- 工具注册表 ----

function buildToolRegistry(): ToolRegistry {
  const registry: ToolRegistry = new Map();

  // read_file
  registry.set("read_file", {
    definition: {
      name: "read_file",
      description: "Read a file and return its contents",
      parameters: {
        type: "object",
        properties: { file_path: { type: "string" } },
        required: ["file_path"],
      },
    },
    execute: async (params) => {
      const fs = await import("node:fs/promises");
      return fs.readFile(params.file_path as string, "utf-8");
    },
  });

  // edit_file
  registry.set("edit_file", {
    definition: {
      name: "edit_file",
      description: "Edit a file by replacing old_string with new_string",
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string" },
          old_string: { type: "string" },
          new_string: { type: "string" },
        },
        required: ["file_path", "old_string", "new_string"],
      },
    },
    execute: async (params) => {
      const fs = await import("node:fs/promises");
      const filePath = params.file_path as string;
      const content = await fs.readFile(filePath, "utf-8");
      const updated = content.replace(params.old_string as string, params.new_string as string);
      await fs.writeFile(filePath, updated);
      return `Updated ${filePath}`;
    },
  });

  // bash
  registry.set("bash", {
    definition: {
      name: "bash",
      description: "Execute a shell command",
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
    },
    execute: async (params) => {
      const { execSync } = await import("node:child_process");
      try {
        return execSync(params.command as string, {
          encoding: "utf-8",
          timeout: 30_000,
        });
      } catch (err: any) {
        return `Error: ${err.message}`;
      }
    },
  });

  // grep
  registry.set("grep", {
    definition: {
      name: "grep",
      description: "Search for a pattern in files",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string" },
          path: { type: "string" },
        },
        required: ["pattern"],
      },
    },
    execute: async (params) => {
      const { execSync } = await import("node:child_process");
      const path = (params.path as string) || ".";
      try {
        return execSync(`grep -r "${params.pattern}" ${path} --include="*.ts" -l`, {
          encoding: "utf-8",
          timeout: 10_000,
        });
      } catch {
        return "No matches found.";
      }
    },
  });

  // glob
  registry.set("glob", {
    definition: {
      name: "glob",
      description: "List files matching a glob pattern",
      parameters: {
        type: "object",
        properties: { pattern: { type: "string" } },
        required: ["pattern"],
      },
    },
    execute: async (params) => {
      const { execSync } = await import("node:child_process");
      try {
        return execSync(`find . -name "${params.pattern}" -type f`, {
          encoding: "utf-8",
          timeout: 10_000,
        });
      } catch {
        return "No files found.";
      }
    },
  });

  // list_files
  registry.set("list_files", {
    definition: {
      name: "list_files",
      description: "List files in a directory",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
    execute: async (params) => {
      const fs = await import("node:fs/promises");
      const entries = await fs.readdir(params.path as string, { withFileTypes: true });
      return entries
        .map((e) => `${e.isDirectory() ? "d" : "f"} ${e.name}`)
        .join("\n");
    },
  });

  return registry;
}

// ---- "agent" 工具：让 LLM 自己决定何时启动子 Agent ----

function buildAgentTool(
  spawner: AgentSpawner
): Tool {
  return {
    name: "agent",
    description: `Launch a sub-agent to handle a task independently. The sub-agent has its own context and tools. Available roles: plan (read-only analysis), code (full tools), review (read-only review).`,
    parameters: {
      type: "object",
      properties: {
        role: {
          type: "string",
          enum: ["plan", "code", "review"],
          description: "The role of the sub-agent",
        },
        name: {
          type: "string",
          description: "A short name for this sub-agent (e.g. 'route-migrator')",
        },
        task: {
          type: "string",
          description: "The specific task for the sub-agent",
        },
      },
      required: ["role", "task"],
    },
  };
}

async function executeAgentTool(
  spawner: AgentSpawner,
  params: Record<string, unknown>
): Promise<string> {
  const role = params.role as string;
  const task = params.task as string;
  const name = (params.name as string) || `${role}-agent`;

  let config;
  switch (role) {
    case "plan":
      config = planAgent(task);
      break;
    case "code":
      config = codeAgent(name, task);
      break;
    case "review":
      config = reviewAgent(task);
      break;
    default:
      return `Unknown role: ${role}`;
  }

  if (name) config.name = name;

  const result = await spawner.spawn(config, task);
  return result.success
    ? result.output
    : `[${result.name}] Failed: ${result.error}\n${result.output}`;
}

// ---- 主循环 ----

async function main() {
  const toolRegistry = buildToolRegistry();
  const spawner = new AgentSpawner(provider, toolRegistry);

  // 把所有内置工具 + agent 工具合并
  const allTools: Tool[] = [
    ...Array.from(toolRegistry.values()).map((t) => t.definition),
    buildAgentTool(spawner),
  ];

  console.log(`Ling ready. ${allTools.length} tools available (including agent tool).\n`);

  const messages: Message[] = [
    {
      role: "system",
      content: `You are Ling, a coding assistant. You can launch sub-agents for complex tasks:
- Use the "agent" tool with role="plan" to analyze before making changes
- Use the "agent" tool with role="code" to make specific code changes
- Use the "agent" tool with role="review" to review changes
Each sub-agent runs independently with its own context.`,
    },
  ];

  const userInput = process.argv[2] ?? "Migrate this Express app to Hono";
  messages.push({ role: "user", content: userInput });
  console.log(`User: ${userInput}\n`);

  // Agent loop
  while (true) {
    const response = await provider.chat(messages, allTools);

    // 把 assistant 消息加入历史
    messages.push({
      role: "assistant",
      content: response.content ?? "",
      toolCalls: response.toolCalls.length > 0 ? response.toolCalls : undefined,
    });

    if (response.toolCalls.length === 0) {
      console.log(`Ling: ${response.content}\n`);
      break;
    }

    for (const call of response.toolCalls) {
      const toolName = call.name;
      const params = JSON.parse(call.arguments);

      console.log(`[tool] ${toolName}(${call.arguments.slice(0, 120)})`);

      let result: string;

      if (toolName === "agent") {
        // 特殊处理：启动子 Agent
        result = await executeAgentTool(spawner, params);
      } else {
        // 普通内置工具
        const entry = toolRegistry.get(toolName);
        if (!entry) {
          result = `Unknown tool: ${toolName}`;
        } else {
          result = await entry.execute(params);
        }
      }

      console.log(`[result] ${result.slice(0, 200)}\n`);

      messages.push({
        role: "tool",
        toolCallId: call.id,
        content: result,
      });
    }
  }
}

main().catch(console.error);
