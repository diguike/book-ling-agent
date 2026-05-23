// 终端渲染器
// 负责：逐字输出文本、工具调用中间态、spinner 动画、彩色输出
// 不依赖 chalk —— 直接用 ANSI escape codes

import type { StreamChunk } from "./types.js";

// ── ANSI 颜色 ───────────────────────────────────────
const RESET  = "\x1b[0m";
const BOLD   = "\x1b[1m";
const DIM    = "\x1b[2m";
const CYAN   = "\x1b[36m";
const GREEN  = "\x1b[32m";
const YELLOW = "\x1b[33m";
const MAGENTA = "\x1b[35m";

// ── 工具名到图标的映射 ──────────────────────────────
const TOOL_ICONS: Record<string, string> = {
  read_file:  "📄",
  write_file: "✏️",
  edit_file:  "✏️",
  bash:       "💻",
  grep:       "🔍",
  glob:       "📂",
  list_files: "📂",
  ask_user:   "💬",
};

function toolIcon(name: string): string {
  return TOOL_ICONS[name] ?? "🔧";
}

// ── Spinner ─────────────────────────────────────────
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class Spinner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private frameIdx = 0;
  private label = "";

  start(label: string): void {
    this.stop(); // 确保之前的已停止
    this.label = label;
    this.frameIdx = 0;

    this.timer = setInterval(() => {
      const frame = SPINNER_FRAMES[this.frameIdx % SPINNER_FRAMES.length];
      // \r 回到行首，\x1b[K 清除到行尾
      process.stderr.write(`\r${DIM}${frame} ${this.label}${RESET}\x1b[K`);
      this.frameIdx++;
    }, 80);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      process.stderr.write("\r\x1b[K"); // 清除 spinner 行
    }
  }
}

// ── 主渲染器 ─────────────────────────────────────────
export class StreamRenderer {
  private spinner = new Spinner();
  private hasOutput = false;

  /** 处理一个流式 chunk 并渲染到终端 */
  onChunk(chunk: StreamChunk): void {
    switch (chunk.type) {
      case "text":
        this.renderText(chunk.content);
        break;

      case "tool_call_start":
        this.renderToolStart(chunk.toolName ?? "unknown", chunk.toolCallId);
        break;

      case "tool_call_delta":
        // 参数片段不输出给用户（太碎太吵）
        break;

      case "tool_call_end":
        // tool_call_end 本身不渲染，等实际执行时再显示
        break;

      case "finish":
        this.renderFinish();
        break;
    }
  }

  /** 逐 token 输出文本 */
  private renderText(text: string): void {
    if (!this.hasOutput) {
      process.stdout.write(`\n${BOLD}${CYAN}Ling:${RESET} `);
      this.hasOutput = true;
    }
    process.stdout.write(text);
  }

  /** 工具调用开始——显示中间态 */
  private renderToolStart(name: string, id?: string): void {
    // 如果之前有文本输出，先换行
    if (this.hasOutput) {
      process.stdout.write("\n");
      this.hasOutput = false;
    }
    const icon = toolIcon(name);
    process.stderr.write(
      `\n${DIM}  ${icon} ${name}${id ? ` (${id.slice(-6)})` : ""}${RESET}\n`
    );
  }

  /** 响应结束 */
  private renderFinish(): void {
    if (this.hasOutput) {
      process.stdout.write("\n");
      this.hasOutput = false;
    }
  }

  /** 开始执行工具时调用——启动 spinner */
  startToolExecution(name: string, summary: string): void {
    const icon = toolIcon(name);
    this.spinner.start(`${icon} ${name}: ${summary}`);
  }

  /** 工具执行完毕 */
  stopToolExecution(name: string, success: boolean): void {
    this.spinner.stop();
    const icon = toolIcon(name);
    const status = success
      ? `${GREEN}✓${RESET}`
      : `${YELLOW}✗${RESET}`;
    process.stderr.write(`  ${icon} ${name} ${status}\n`);
  }

  /** 显示一行提示信息 */
  info(msg: string): void {
    process.stderr.write(`${DIM}${msg}${RESET}\n`);
  }

  /** 重置状态（新一轮对话前调用） */
  reset(): void {
    this.hasOutput = false;
    this.spinner.stop();
  }
}
