import * as readline from "readline";
import type { Tool } from "./types.js";

export const askUserTool: Tool = {
  name: "ask_user",
  description: "Ask the user a question and wait for their response. Use when you need clarification or confirmation.",
  schema: {
    type: "object",
    properties: {
      question: { type: "string", description: "The question to ask" },
    },
    required: ["question"],
  },
  async execute(params) {
    const question = params.question as string;
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr, // 用 stderr 显示提示，stdout 留给程序输出
    });
    return new Promise<string>((resolve) => {
      rl.question(`\n🤖 Agent asks: ${question}\n> `, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  },
};
