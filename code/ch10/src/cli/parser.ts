// CLI 参数解析——用 Node.js 内置的 parseArgs
// 不依赖 commander / yargs，够用就行

import { parseArgs } from "node:util";

export interface CliOptions {
  // 非交互模式
  print?: string;           // -p "query"

  // 输出格式
  format: "text" | "json" | "stream";
  schema?: string;          // JSON Schema 文件路径

  // 模型配置
  provider: string;
  model: string;
  maxTurns: number;

  // 会话管理（ch07）
  continue: boolean;
  resume?: string;
  name?: string;

  // 其他
  help: boolean;
  version: boolean;
}

export function parseCli(argv: string[]): CliOptions {
  const { values } = parseArgs({
    args: argv.slice(2),  // 跳过 node 和脚本路径
    options: {
      // 非交互
      print:    { type: "string",  short: "p" },

      // 输出
      format:   { type: "string",  short: "f", default: "text" },
      schema:   { type: "string" },

      // 模型
      provider: { type: "string",  default: "openai" },
      model:    { type: "string",  short: "m", default: process.env.LLM_MODEL || "gpt-4o" },
      "max-turns": { type: "string", default: "10" },

      // 会话
      continue: { type: "boolean", short: "c", default: false },
      resume:   { type: "string",  short: "r" },
      name:     { type: "string",  short: "n" },

      // 元信息
      help:     { type: "boolean", short: "h", default: false },
      version:  { type: "boolean", short: "v", default: false },
    },
    strict: true,
  });

  return {
    print:    values.print as string | undefined,
    format:   (values.format as "text" | "json" | "stream") ?? "text",
    schema:   values.schema as string | undefined,
    provider: (values.provider as string) ?? "openai",
    model:    (values.model as string) ?? "gpt-4o",
    maxTurns: parseInt(values["max-turns"] as string, 10) || 10,
    continue: values.continue as boolean,
    resume:   values.resume as string | undefined,
    name:     values.name as string | undefined,
    help:     values.help as boolean,
    version:  values.version as boolean,
  };
}

/** 从 stdin 读取管道输入（如果有的话） */
export async function readStdin(): Promise<string | null> {
  // 如果 stdin 是 TTY（终端），说明没有管道输入
  if (process.stdin.isTTY) return null;

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf-8").trim();
  return text || null;
}
