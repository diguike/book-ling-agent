// Print 模式——非交互执行，跑完即退

import type { LLMProvider, Tool, Message } from "../providers/index.js";
import type { CliOptions } from "./parser.js";
import { writeOutput, writeStreamEvent } from "./output.js";
import { loadSchema, extractJson, validateAgainstSchema } from "./schema-validator.js";
import { createToolRegistry } from "../tools/index.js";
import { PermissionGuard, loadPermissionConfig } from "../permissions/index.js";

/** 非交互模式主函数 */
export async function runPrintMode(
  query: string,
  options: CliOptions,
  provider: LLMProvider
): Promise<void> {
  // 初始化工具注册表和权限守卫
  const registry = createToolRegistry();
  const permConfig = loadPermissionConfig();
  const guard = new PermissionGuard(permConfig);

  // 构建 system prompt
  let systemPrompt = "You are Ling, a coding assistant.";

  // 如果指定了 schema，注入约束
  let schemaConstraint: ReturnType<typeof loadSchema> | null = null;
  if (options.schema) {
    schemaConstraint = loadSchema(options.schema);
    systemPrompt += "\n\n" + schemaConstraint.promptInstructions;
  }

  // 把 ch10 的 Tool 注册表转成 Provider 统一的 Tool 格式
  const tools: Tool[] = registry.list().map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.schema,
  }));

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: query },
  ];

  // stream 模式发一个 start 事件
  if (options.format === "stream") {
    writeStreamEvent({ type: "start", model: options.model });
  }

  let turns = 0;
  let finalContent = "";

  // Agent loop——带工具调用的循环
  while (turns < options.maxTurns) {
    turns++;

    const response = await provider.chat(messages, tools);
    finalContent = response.content ?? "";

    // stream 模式实时输出
    if (options.format === "stream" && finalContent) {
      writeStreamEvent({ type: "text_delta", content: finalContent });
    }

    // 没有 tool_calls，结束循环
    if (response.toolCalls.length === 0) {
      // 把最后的 assistant 消息加入历史
      messages.push({
        role: "assistant",
        content: finalContent,
      });
      break;
    }

    // 有 tool_calls 就执行
    messages.push({
      role: "assistant",
      content: finalContent,
      toolCalls: response.toolCalls,
    });

    for (const toolCall of response.toolCalls) {
      const toolName = toolCall.name;
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(toolCall.arguments);
      } catch {
        // LLM 返回了无效 JSON，尝试修复常见问题
        const fixed = toolCall.arguments
          .replace(/float\('inf'\)/g, "null")
          .replace(/float\('nan'\)/g, "null")
          .replace(/'/g, '"');
        try {
          args = JSON.parse(fixed);
        } catch {
          const errorResult = `Error: invalid tool arguments: ${toolCall.arguments}`;
          messages.push({ role: "tool", toolCallId: toolCall.id, content: errorResult });
          continue;
        }
      }

      if (options.format === "stream") {
        writeStreamEvent({
          type: "tool_use",
          tool: toolName,
          args,
        });
      }

      // 权限检查
      let result: string;
      const allowed = await guard.check(toolName, args);
      if (!allowed) {
        result = `[Permission denied] Tool "${toolName}" was blocked by permission guard.`;
      } else {
        try {
          result = await registry.execute(toolName, args);
        } catch (err) {
          result = `Error executing ${toolName}: ${(err as Error).message}`;
        }
      }

      if (options.format === "stream") {
        writeStreamEvent({ type: "tool_result", tool: toolName, result });
      }

      messages.push({
        role: "tool",
        toolCallId: toolCall.id,
        content: result,
      });
    }
  }

  // 如果有 schema 约束，验证输出
  let structuredOutput: unknown = undefined;
  if (schemaConstraint) {
    try {
      const parsed = extractJson(finalContent);
      const { valid, errors } = validateAgainstSchema(parsed, schemaConstraint.schema);

      if (!valid) {
        process.stderr.write(`Schema validation failed: ${errors.join(", ")}\n`);
        process.exit(1);
      }

      structuredOutput = parsed;
      // schema 模式下，输出纯 JSON
      finalContent = JSON.stringify(parsed, null, 2);
    } catch (err) {
      process.stderr.write(`Failed to parse structured output: ${(err as Error).message}\n`);
      process.exit(1);
    }
  }

  // 最终输出
  writeOutput(options.format, {
    content: finalContent,
    model: options.model,
    turns,
    structured_output: structuredOutput,
  });
}
