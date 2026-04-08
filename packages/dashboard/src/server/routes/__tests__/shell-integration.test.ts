import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { setupTestContext, type TestContext } from "./test-setup";

describe("getShellIntegration", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestContext();
  });

  afterEach(async () => {
    ctx.registryDatabase.close();
  });

  test("returns empty shell integration when no shell files exist", async () => {
    const result = await ctx.api.getShellIntegration();

    expect(result.success).toBe(true);
    expect(result.data?.completions).toEqual([]);
    expect(result.data?.initScripts).toEqual([]);
    expect(result.data?.totalFiles).toBe(0);
  });

  test("returns completions grouped by tool", async () => {
    const { randomUUID } = await import("./test-setup");

    await ctx.fileRegistry.recordOperation({
      toolName: "fzf",
      operationType: "writeFile",
      filePath: "/home/user/.dotfiles/.generated/completions/_fzf",
      fileType: "completion",
      operationId: randomUUID(),
    });

    await ctx.fileRegistry.recordOperation({
      toolName: "bat",
      operationType: "writeFile",
      filePath: "/home/user/.dotfiles/.generated/completions/_bat",
      fileType: "completion",
      operationId: randomUUID(),
    });

    const result = await ctx.api.getShellIntegration();

    expect(result.success).toBe(true);
    expect(result.data?.completions).toHaveLength(2);
    expect(result.data?.completions.map((completion) => completion.toolName).toSorted()).toEqual(["bat", "fzf"]);
  });

  test("returns init scripts grouped by tool", async () => {
    const { randomUUID } = await import("./test-setup");

    await ctx.fileRegistry.recordOperation({
      toolName: "starship",
      operationType: "writeFile",
      filePath: "/home/user/.dotfiles/.generated/shell-scripts/starship.zsh",
      fileType: "init",
      operationId: randomUUID(),
    });

    const result = await ctx.api.getShellIntegration();

    expect(result.success).toBe(true);
    expect(result.data?.initScripts).toHaveLength(1);
    expect(result.data?.initScripts[0]?.toolName).toBe("starship");
    expect(result.data?.initScripts[0]?.filePath).toBe("/home/user/.dotfiles/.generated/shell-scripts/starship.zsh");
  });

  test("calculates total shell files correctly", async () => {
    const { randomUUID } = await import("./test-setup");

    await ctx.fileRegistry.recordOperation({
      toolName: "fzf",
      operationType: "writeFile",
      filePath: "/completions/_fzf",
      fileType: "completion",
      operationId: randomUUID(),
    });

    await ctx.fileRegistry.recordOperation({
      toolName: "fzf",
      operationType: "writeFile",
      filePath: "/shell-scripts/fzf.zsh",
      fileType: "init",
      operationId: randomUUID(),
    });

    await ctx.fileRegistry.recordOperation({
      toolName: "bat",
      operationType: "writeFile",
      filePath: "/completions/_bat",
      fileType: "completion",
      operationId: randomUUID(),
    });

    const result = await ctx.api.getShellIntegration();

    expect(result.success).toBe(true);
    expect(result.data?.totalFiles).toBe(3);
    expect(result.data?.completions).toHaveLength(2);
    expect(result.data?.initScripts).toHaveLength(1);
  });
});
