// JSON Schema 输出约束——把 schema 注入 prompt，验证输出

import { readFileSync } from "node:fs";

export interface SchemaConstraint {
  schema: Record<string, unknown>;
  promptInstructions: string;
}

/** 加载 JSON Schema 文件，生成注入 prompt 的指令 */
export function loadSchema(schemaPath: string): SchemaConstraint {
  const raw = readFileSync(schemaPath, "utf-8");
  const schema = JSON.parse(raw);

  // 构造注入 system prompt 的约束指令
  const promptInstructions = [
    "IMPORTANT: Your final response MUST be a valid JSON object conforming to this schema:",
    "```json",
    JSON.stringify(schema, null, 2),
    "```",
    "Do NOT include any text before or after the JSON.",
    "Do NOT wrap the JSON in markdown code fences.",
    "Output ONLY the raw JSON object.",
  ].join("\n");

  return { schema, promptInstructions };
}

/** 从 LLM 输出中提取 JSON */
export function extractJson(text: string): unknown {
  // 尝试直接解析
  try {
    return JSON.parse(text);
  } catch {
    // 可能被包在 ```json ... ``` 里
  }

  // 用正则提取 code fence 中的 JSON
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {
      // 继续尝试
    }
  }

  // 找第一个 { 到最后一个 } 之间的内容
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      // 放弃
    }
  }

  throw new Error("Failed to extract JSON from LLM output");
}

/** 简易 JSON Schema 验证（只检查 required 字段和顶层类型） */
export function validateAgainstSchema(
  data: unknown,
  schema: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (schema.type === "object") {
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      errors.push(`Expected object, got ${typeof data}`);
      return { valid: false, errors };
    }

    const required = (schema.required as string[]) ?? [];
    const obj = data as Record<string, unknown>;

    for (const key of required) {
      if (!(key in obj)) {
        errors.push(`Missing required field: "${key}"`);
      }
    }
  }

  if (schema.type === "array" && !Array.isArray(data)) {
    errors.push(`Expected array, got ${typeof data}`);
  }

  return { valid: errors.length === 0, errors };
}
