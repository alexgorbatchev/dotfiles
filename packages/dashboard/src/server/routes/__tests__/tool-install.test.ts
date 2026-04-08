import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createMockToolConfigForTests, setupTestContext, type TestContext } from "./test-setup";

describe("installTool", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestContext();
  });

  afterEach(async () => {
    ctx.registryDatabase.close();
  });

  test("returns error when tool not found", async () => {
    const result = await ctx.api.installTool("nonexistent", {});

    expect(result.success).toBe(false);
    expect(result.error).toBe('Tool "nonexistent" not found in configuration');
  });

  test("calls installer with force=false by default", async () => {
    ctx.toolConfigs["fzf"] = createMockToolConfigForTests({
      name: "fzf",
      version: "latest",
      installationMethod: "github-release",
      installParams: { repo: "junegunn/fzf" },
      binaries: ["fzf"],
    });

    const result = await ctx.api.installTool("fzf", {});

    expect(result.success).toBe(true);
    expect(result.data?.installed).toBe(true);
    expect(result.data?.version).toBe("1.0.0");
    expect(result.data?.alreadyInstalled).toBe(false);
    expect(ctx.mockInstaller.install).toHaveBeenCalledTimes(1);
    expect(ctx.mockInstaller.install).toHaveBeenCalledWith("fzf", ctx.toolConfigs["fzf"], { force: false });
  });

  test("calls installer with force=true when requested", async () => {
    ctx.toolConfigs["fzf"] = createMockToolConfigForTests({
      name: "fzf",
      version: "latest",
      installationMethod: "github-release",
      installParams: { repo: "junegunn/fzf" },
      binaries: ["fzf"],
    });

    const result = await ctx.api.installTool("fzf", { force: true });

    expect(result.success).toBe(true);
    expect(result.data?.installed).toBe(true);
    expect(ctx.mockInstaller.install).toHaveBeenCalledWith("fzf", ctx.toolConfigs["fzf"], { force: true });
  });

  test("returns alreadyInstalled when installer indicates so", async () => {
    ctx.toolConfigs["fzf"] = createMockToolConfigForTests({
      name: "fzf",
      version: "latest",
      installationMethod: "github-release",
      installParams: { repo: "junegunn/fzf" },
      binaries: ["fzf"],
    });

    ctx.mockInstaller.install.mockResolvedValueOnce({
      success: true,
      version: "0.55.0",
      installationMethod: "already-installed",
    });

    const result = await ctx.api.installTool("fzf", {});

    expect(result.success).toBe(true);
    expect(result.data?.installed).toBe(true);
    expect(result.data?.alreadyInstalled).toBe(true);
    expect(result.data?.version).toBe("0.55.0");
  });

  test("returns error when installation fails", async () => {
    ctx.toolConfigs["fzf"] = createMockToolConfigForTests({
      name: "fzf",
      version: "latest",
      installationMethod: "github-release",
      installParams: { repo: "junegunn/fzf" },
      binaries: ["fzf"],
    });

    ctx.mockInstaller.install.mockResolvedValueOnce({
      success: false,
      error: "Download failed: 404",
    });

    const result = await ctx.api.installTool("fzf", {});

    expect(result.success).toBe(true);
    expect(result.data?.installed).toBe(false);
    expect(result.data?.error).toBe("Download failed: 404");
  });

  test("handles installer throwing an exception", async () => {
    ctx.toolConfigs["fzf"] = createMockToolConfigForTests({
      name: "fzf",
      version: "latest",
      installationMethod: "github-release",
      installParams: { repo: "junegunn/fzf" },
      binaries: ["fzf"],
    });

    ctx.mockInstaller.install.mockRejectedValueOnce(new Error("Network timeout"));

    const result = await ctx.api.installTool("fzf", {});

    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to install tool: Network timeout");
  });
});
