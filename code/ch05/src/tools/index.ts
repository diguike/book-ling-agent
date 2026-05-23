import { ToolRegistry } from "./types.js";
import { readFileTool } from "./read-file.js";
import { writeFileTool } from "./write-file.js";
import { editFileTool } from "./edit-file.js";
import { grepTool } from "./grep.js";
import { globTool } from "./glob.js";
import { bashTool } from "./bash.js";
import { listFilesTool } from "./list-files.js";
import { askUserTool } from "./ask-user.js";

export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(readFileTool);
  registry.register(writeFileTool);
  registry.register(editFileTool);
  registry.register(grepTool);
  registry.register(globTool);
  registry.register(bashTool);
  registry.register(listFilesTool);
  registry.register(askUserTool);
  return registry;
}

export { ToolRegistry } from "./types.js";
