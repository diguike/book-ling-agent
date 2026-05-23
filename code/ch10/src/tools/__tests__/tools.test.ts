import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFile, readFile, unlink, mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { readFileTool } from "../read-file.js";
import { writeFileTool } from "../write-file.js";
import { editFileTool } from "../edit-file.js";
import { grepTool } from "../grep.js";
import { globTool } from "../glob.js";
import { bashTool } from "../bash.js";
import { listFilesTool } from "../list-files.js";
import { askUserTool } from "../ask-user.js";

// Helper: create a temp directory for each test that needs files
async function makeTmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ling-test-"));
}

// ─── read_file ──────────────────────────────────────────────
describe("read_file", () => {
  it("should read an existing file and return numbered lines", async () => {
    const dir = await makeTmpDir();
    const filePath = join(dir, "hello.txt");
    await writeFile(filePath, "line1\nline2\nline3", "utf-8");

    const result = await readFileTool.execute({ file_path: filePath });
    assert.ok(result.includes("line1"));
    assert.ok(result.includes("line2"));
    assert.ok(result.includes("line3"));
    // should contain line numbers
    assert.ok(result.includes("1\t"));

    await rm(dir, { recursive: true });
  });

  it("should support offset and limit", async () => {
    const dir = await makeTmpDir();
    const filePath = join(dir, "range.txt");
    await writeFile(filePath, "a\nb\nc\nd\ne", "utf-8");

    const result = await readFileTool.execute({ file_path: filePath, offset: 2, limit: 2 });
    assert.ok(result.includes("b"));
    assert.ok(result.includes("c"));
    assert.ok(!result.includes("\t" + "a"));
    assert.ok(!result.includes("\t" + "d"));

    await rm(dir, { recursive: true });
  });

  it("should return an error for a non-existent file", async () => {
    await assert.rejects(
      () => readFileTool.execute({ file_path: "/tmp/__does_not_exist_12345__.txt" }),
    );
  });
});

// ─── write_file ─────────────────────────────────────────────
describe("write_file", () => {
  it("should create a file with the given content", async () => {
    const dir = await makeTmpDir();
    const filePath = join(dir, "subdir", "output.txt");
    const content = "hello world";

    const result = await writeFileTool.execute({ file_path: filePath, content });
    assert.ok(result.includes("File written"));

    const actual = await readFile(filePath, "utf-8");
    assert.equal(actual, content);

    await rm(dir, { recursive: true });
  });
});

// ─── edit_file ──────────────────────────────────────────────
describe("edit_file", () => {
  it("should replace a string in a file", async () => {
    const dir = await makeTmpDir();
    const filePath = join(dir, "edit-me.txt");
    await writeFile(filePath, "foo bar baz", "utf-8");

    const result = await editFileTool.execute({
      file_path: filePath,
      old_string: "bar",
      new_string: "qux",
    });
    assert.ok(result.includes("replaced"));

    const actual = await readFile(filePath, "utf-8");
    assert.equal(actual, "foo qux baz");

    await rm(dir, { recursive: true });
  });

  it("should return error when old_string is not found", async () => {
    const dir = await makeTmpDir();
    const filePath = join(dir, "edit-me.txt");
    await writeFile(filePath, "foo bar baz", "utf-8");

    const result = await editFileTool.execute({
      file_path: filePath,
      old_string: "notfound",
      new_string: "x",
    });
    assert.ok(result.includes("Error"));

    await rm(dir, { recursive: true });
  });

  it("should handle replace_all", async () => {
    const dir = await makeTmpDir();
    const filePath = join(dir, "dup.txt");
    await writeFile(filePath, "aaa bbb aaa", "utf-8");

    const result = await editFileTool.execute({
      file_path: filePath,
      old_string: "aaa",
      new_string: "ccc",
      replace_all: true,
    });
    assert.ok(result.includes("replaced 2"));

    const actual = await readFile(filePath, "utf-8");
    assert.equal(actual, "ccc bbb ccc");

    await rm(dir, { recursive: true });
  });
});

// ─── grep ───────────────────────────────────────────────────
describe("grep", () => {
  it("should find a known string in the project", async () => {
    // Search for the string "ToolRegistry" in the tools source directory
    const result = await grepTool.execute({
      pattern: "ToolRegistry",
      path: join(import.meta.dirname, ".."),
      glob: "*.ts",
    });
    assert.ok(result.includes("ToolRegistry"), `Expected to find ToolRegistry, got: ${result}`);
  });

  it("should return no-matches message for absent pattern", async () => {
    const dir = await makeTmpDir();
    await writeFile(join(dir, "empty.txt"), "nothing here", "utf-8");
    const result = await grepTool.execute({
      pattern: "ZZZZZ_NEVER_EXISTS_12345",
      path: dir,
    });
    assert.ok(result.includes("No matches"), `Expected no-matches message, got: ${result}`);
    await rm(dir, { recursive: true });
  });
});

// ─── glob ───────────────────────────────────────────────────
describe("glob", () => {
  it("should match *.ts files in the tools directory", async () => {
    const result = await globTool.execute({
      pattern: "*.ts",
      cwd: join(import.meta.dirname, ".."),
    });
    assert.ok(result.includes(".ts"), `Expected .ts files, got: ${result}`);
    // Should find at least the known files
    assert.ok(result.includes("types.ts"));
  });

  it("should return no-files message for unmatched pattern", async () => {
    const result = await globTool.execute({
      pattern: "*.xyz_nope",
      cwd: join(import.meta.dirname, ".."),
    });
    assert.equal(result, "No files matched.");
  });
});

// ─── bash ───────────────────────────────────────────────────
describe("bash", () => {
  it("should execute echo and return output", async () => {
    const result = await bashTool.execute({ command: "echo hello" });
    assert.equal(result, "hello");
  });

  it("should capture stderr", async () => {
    const result = await bashTool.execute({ command: "echo err >&2" });
    assert.ok(result.includes("err"));
  });

  it("should handle timeout", async () => {
    const result = await bashTool.execute({ command: "sleep 10", timeout: 500 });
    assert.ok(result.includes("timed out"));
  });
});

// ─── list_files ─────────────────────────────────────────────
describe("list_files", () => {
  it("should list files in the tools directory", async () => {
    const result = await listFilesTool.execute({
      path: join(import.meta.dirname, ".."),
    });
    // Should contain known files
    assert.ok(result.includes("types.ts"));
    assert.ok(result.includes("bash.ts"));
    assert.ok(result.includes("[file]"));
  });

  it("should show directories with [dir] marker", async () => {
    const result = await listFilesTool.execute({
      path: join(import.meta.dirname, ".."),
    });
    assert.ok(result.includes("[dir]"));
    assert.ok(result.includes("__tests__/"));
  });
});

// ─── ask_user ───────────────────────────────────────────────
describe("ask_user", () => {
  it.skip("should ask user a question (requires interactive stdin)", async () => {
    // This tool requires interactive terminal input, so we skip it.
    await askUserTool.execute({ question: "test?" });
  });
});
