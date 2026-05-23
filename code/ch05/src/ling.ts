import * as readline from "readline";
import { createToolRegistry } from "./tools/index.js";
import { PermissionGuard, loadPermissionConfig } from "./permissions/index.js";
import { createProvider } from "./providers/factory.js";
import type { Message, ToolDefinition } from "./providers/types.js";

const registry = createToolRegistry();
const config = loadPermissionConfig();
const guard = new PermissionGuard(config);
const provider = createProvider();

const systemPrompt = `You are Ling, a coding assistant. You have access to tools to read, write, edit files, search code, and run commands. Use tools to accomplish tasks step by step.`;

// 将 ToolRegistry 的工具转成 Provider 通用格式
function getToolDefinitions(): ToolDefinition[] {
  return registry.list().map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.schema,
    },
  }));
}

async function agentLoop(userMessage: string, history: Message[]): Promise<string> {
  history.push({ role: "user", content: userMessage });

  const tools = getToolDefinitions();

  while (true) {
    const response = await provider.chat(
      [{ role: "system", content: systemPrompt }, ...history],
      tools,
    );

    if (response.toolCalls.length === 0) {
      const content = response.content ?? "(no response)";
      history.push({ role: "assistant", content });
      return content;
    }

    // 记录 assistant 消息（含工具调用）
    history.push({
      role: "assistant",
      content: response.content,
      tool_calls: response.toolCalls,
    });

    for (const toolCall of response.toolCalls) {
      const name = toolCall.function.name;
      const params = JSON.parse(toolCall.function.arguments);

      // ---- 权限检查：在执行前拦截 ----
      const allowed = await guard.check(name, params);

      if (!allowed) {
        // 被拒绝：告诉 LLM 这个操作不允许
        history.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: `Permission denied: this operation was blocked by the permission system. Try a different approach.`,
        });
        continue;
      }

      console.log(`  [tool] ${name}(${JSON.stringify(params).slice(0, 80)}...)`);

      let result: string;
      try {
        result = await registry.execute(name, params);
      } catch (err) {
        result = `Error: ${(err as Error).message}`;
      }

      history.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }
  }
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const history: Message[] = [];
  console.log("Ling Agent (ch05) — permission system enabled");
  console.log(`Provider: ${provider.name}`);
  console.log(`Project root: ${config.projectRoot}`);
  console.log(`Rules loaded: ${config.rules.length}\n`);

  const prompt = () => {
    rl.question("You: ", async (input) => {
      if (!input.trim()) return prompt();
      try {
        const reply = await agentLoop(input, history);
        console.log(`\nLing: ${reply}\n`);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}\n`);
      }
      prompt();
    });
  };
  prompt();
}

main();
