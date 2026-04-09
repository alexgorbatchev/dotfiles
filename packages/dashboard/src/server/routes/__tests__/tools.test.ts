import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createMockToolConfigForTests, setupTestContext, type ITestContext } from "./test-setup";

describe("getTools", () => {
  let ctx: ITestContext;

  beforeEach(async () => {
    ctx = await setupTestContext();
  });

  afterEach(async () => {
    ctx.registryDatabase.close();
  });

  test("returns empty array when no tool configs", async () => {
    const result = await ctx.api.getTools();

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  test("returns tool details from config with not-installed status", async () => {
    ctx.toolConfigs["fzf"] = createMockToolConfigForTests({
      name: "fzf",
      version: "latest",
      installationMethod: "github-release",
      installParams: { repo: "junegunn/fzf" },
      binaries: ["fzf"],
    });

    const result = await ctx.api.getTools();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.config.name).toBe("fzf");
    expect(result.data?.[0]?.config.installationMethod).toBe("github-release");
    expect(result.data?.[0]?.runtime.status).toBe("not-installed");
  });

  test("returns tool details with installed status when registry has record", async () => {
    ctx.toolConfigs["fzf"] = createMockToolConfigForTests({
      name: "fzf",
      version: "latest",
      installationMethod: "github-release",
      installParams: { repo: "junegunn/fzf" },
      binaries: ["fzf"],
    });

    await ctx.toolInstallationRegistry.recordToolInstallation({
      toolName: "fzf",
      version: "0.55.0",
      installPath: "/binaries/fzf/2025-01-01",
      timestamp: "2025-01-01-00-00-00",
      binaryPaths: ["/binaries/fzf/fzf"],
      downloadUrl: "https://github.com/junegunn/fzf/releases/download/v0.55.0/fzf-0.55.0-darwin_arm64.tar.gz",
    });

    const result = await ctx.api.getTools();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.config.name).toBe("fzf");
    expect(result.data?.[0]?.runtime.status).toBe("installed");
    expect(result.data?.[0]?.runtime.installedVersion).toBe("0.55.0");
  });

  test("returns tool details with files", async () => {
    ctx.toolConfigs["fzf"] = createMockToolConfigForTests({
      name: "fzf",
      version: "latest",
      installationMethod: "github-release",
      installParams: { repo: "junegunn/fzf" },
      binaries: ["fzf"],
    });

    const { randomUUID } = await import("./test-setup");

    await ctx.fileRegistry.recordOperation({
      toolName: "fzf",
      operationType: "writeFile",
      filePath: "/bin/fzf",
      fileType: "shim",
      operationId: randomUUID(),
    });

    const result = await ctx.api.getTools();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.config.name).toBe("fzf");
    expect(result.data?.[0]?.files).toHaveLength(1);
    expect(result.data?.[0]?.files?.[0]?.filePath).toBe("/bin/fzf");
  });

  test("handles special characters in tool names", async () => {
    ctx.toolConfigs["tool-with-dash"] = createMockToolConfigForTests({ name: "tool-with-dash" });

    await ctx.toolInstallationRegistry.recordToolInstallation({
      toolName: "tool-with-dash",
      version: "1.0.0",
      installPath: "/binaries/tool-with-dash/2025-01-01",
      timestamp: "2025-01-01-00-00-00",
      binaryPaths: ["/binaries/tool-with-dash/tool"],
    });

    const result = await ctx.api.getTools();
    const tool = result.data?.find((t) => t.config.name === "tool-with-dash");

    expect(result.success).toBe(true);
    expect(tool?.config.name).toBe("tool-with-dash");
  });

  test("handles tool with multiple binaries", async () => {
    ctx.toolConfigs["multi-binary"] = createMockToolConfigForTests({
      name: "multi-binary",
      binaries: ["bin1", "bin2", "bin3"],
    });

    await ctx.toolInstallationRegistry.recordToolInstallation({
      toolName: "multi-binary",
      version: "1.0.0",
      installPath: "/binaries/multi-binary/2025-01-01",
      timestamp: "2025-01-01-00-00-00",
      binaryPaths: ["/binaries/multi-binary/bin1", "/binaries/multi-binary/bin2", "/binaries/multi-binary/bin3"],
    });

    const result = await ctx.api.getTools();
    const tool = result.data?.find((t) => t.config.name === "multi-binary");

    expect(tool?.runtime.binaryPaths).toHaveLength(3);
  });

  test("includes usage details for overview panel", async () => {
    ctx.toolConfigs["github-release--rg"] = createMockToolConfigForTests({
      name: "github-release--rg",
      binaries: ["rg"],
      installationMethod: "github-release",
      installParams: { repo: "BurntSushi/ripgrep" },
    });

    await ctx.toolInstallationRegistry.recordToolUsage("github-release--rg", "rg");
    await ctx.toolInstallationRegistry.recordToolUsage("github-release--rg", "rg");

    const result = await ctx.api.getTools();
    const tool = result.data?.find((t) => t.config.name === "github-release--rg");

    expect(result.success).toBe(true);
    expect(tool?.usage.totalCount).toBe(2);
    expect(tool?.usage.binaries).toHaveLength(1);
    expect(tool?.usage.binaries[0]?.binaryName).toBe("rg");
    expect(tool?.usage.binaries[0]?.count).toBe(2);
    expect(tool?.usage.binaries[0]?.lastUsedAt).toBeString();
  });
});
