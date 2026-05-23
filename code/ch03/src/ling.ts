import OpenAI from "openai";
import * as readline from "readline";
import { createToolRegistry } from "./tools/index.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});
const registry = createToolRegistry();
const model = process.env.LLM_MODEL || "gpt-4o";

type Message = OpenAI.ChatCompletionMessageParam;

const systemPrompt = `You are Ling, a coding assistant. You have access to tools to read, write, edit files, search code, and run commands. Use tools to accomplish tasks step by step.`;

async function agentLoop(userMessage: string, history: Message[]): Promise<string> {
  history.push({ role: "user", content: userMessage });

  while (true) {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "system", content: systemPrompt }, ...history],
      tools: registry.toOpenAITools(),
    });

    const message = response.choices[0].message;
    history.push(message as Message);

    // 没有工具调用 → 返回最终回答
    if (!message.tool_calls || message.tool_calls.length === 0) {
      return message.content ?? "(no response)";
    }

    // 执行每个工具调用
    for (const toolCall of message.tool_calls) {
      const name = toolCall.function.name;
      const params = JSON.parse(toolCall.function.arguments);

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
    // 带着工具结果继续循环
  }
}

// ---- REPL 入口 ----
async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const history: Message[] = [];
  console.log("Ling Agent (ch03) — type your request, Ctrl+C to exit\n");

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
