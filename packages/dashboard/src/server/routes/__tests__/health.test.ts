import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { setupTestContext, type TestContext } from "./test-setup";

describe("getHealth", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestContext();
  });

  afterEach(async () => {
    ctx.registryDatabase.close();
  });

  test("returns healthy status for valid registry", async () => {
    const result = await ctx.api.getHealth();

    expect(result.success).toBe(true);
    expect(result.data?.overall).toBeDefined();
    expect(result.data?.checks).toHaveLength(2);
    expect(result.data?.lastCheck).toBeDefined();
  });

  test("includes registry and tool checks", async () => {
    const result = await ctx.api.getHealth();

    const checkNames = result.data?.checks.map((c) => c.name);
    expect(checkNames).toContain("Registry Integrity");
    expect(checkNames).toContain("Tool Installations");
  });

  test("shows warning when no tools installed", async () => {
    const result = await ctx.api.getHealth();

    expect(result.success).toBe(true);
    const toolCheck = result.data?.checks.find((c) => c.name === "Tool Installations");
    expect(toolCheck?.status).toBe("warn");
    expect(toolCheck?.message).toContain("0 tool");
  });

  test("shows pass when tools are installed", async () => {
    await ctx.toolInstallationRegistry.recordToolInstallation({
      toolName: "fzf",
      version: "0.55.0",
      installPath: "/binaries/fzf/2025-01-01",
      timestamp: "2025-01-01-00-00-00",
      binaryPaths: ["/binaries/fzf/fzf"],
    });

    const result = await ctx.api.getHealth();

    const toolCheck = result.data?.checks.find((c) => c.name === "Tool Installations");
    expect(toolCheck?.status).toBe("pass");
    expect(toolCheck?.message).toContain("1 tool");
  });

  test("does not include unused binaries check when none exist", async () => {
    const result = await ctx.api.getHealth();

    const checkNames = result.data?.checks.map((c) => c.name);
    expect(checkNames).not.toContain("Unused Binaries");
  });

  test("shows warning when unused binaries exist", async () => {
    const binariesDir = ctx.services.projectConfig.paths.binariesDir;
    const toolDir = `${binariesDir}/fzf`;
    const currentVersion = `${toolDir}/v0.55.0`;
    const oldVersion = `${toolDir}/v0.54.0`;

    await ctx.fs.mkdir(currentVersion, { recursive: true });
    await ctx.fs.mkdir(oldVersion, { recursive: true });
    await ctx.fs.writeFile(`${currentVersion}/fzf`, "#!/bin/sh\necho fzf");
    await ctx.fs.writeFile(`${oldVersion}/fzf`, "#!/bin/sh\necho fzf old");
    await ctx.fs.symlink("v0.55.0", `${toolDir}/current`);

    const result = await ctx.api.getHealth();

    const unusedCheck = result.data?.checks.find((c) => c.name === "Unused Binaries");
    expect(unusedCheck?.status).toBe("warn");
    expect(unusedCheck?.message).toBe("");
    expect(unusedCheck?.details).toEqual([oldVersion]);
  });

  test("reports multiple unused binaries", async () => {
    const binariesDir = ctx.services.projectConfig.paths.binariesDir;
    const toolDir = `${binariesDir}/fzf`;
    const currentVersion = `${toolDir}/v0.55.0`;
    const oldVersion1 = `${toolDir}/v0.54.0`;
    const oldVersion2 = `${toolDir}/v0.53.0`;

    await ctx.fs.mkdir(currentVersion, { recursive: true });
    await ctx.fs.mkdir(oldVersion1, { recursive: true });
    await ctx.fs.mkdir(oldVersion2, { recursive: true });
    await ctx.fs.symlink("v0.55.0", `${toolDir}/current`);

    const result = await ctx.api.getHealth();

    const unusedCheck = result.data?.checks.find((c) => c.name === "Unused Binaries");
    expect(unusedCheck?.status).toBe("warn");
    expect(unusedCheck?.message).toBe("");
    expect(unusedCheck?.details).toHaveLength(2);
    expect(unusedCheck?.details).toContain(oldVersion1);
    expect(unusedCheck?.details).toContain(oldVersion2);
  });

  test("reports unused binaries across multiple tools", async () => {
    const binariesDir = ctx.services.projectConfig.paths.binariesDir;

    const fzfDir = `${binariesDir}/fzf`;
    await ctx.fs.mkdir(`${fzfDir}/v0.55.0`, { recursive: true });
    await ctx.fs.mkdir(`${fzfDir}/v0.54.0`, { recursive: true });
    await ctx.fs.symlink("v0.55.0", `${fzfDir}/current`);

    const batDir = `${binariesDir}/bat`;
    await ctx.fs.mkdir(`${batDir}/v0.25.0`, { recursive: true });
    await ctx.fs.mkdir(`${batDir}/v0.24.0`, { recursive: true });
    await ctx.fs.symlink("v0.25.0", `${batDir}/current`);

    const result = await ctx.api.getHealth();

    const unusedCheck = result.data?.checks.find((c) => c.name === "Unused Binaries");
    expect(unusedCheck?.status).toBe("warn");
    expect(unusedCheck?.message).toBe("");
    expect(unusedCheck?.details).toHaveLength(2);
  });
});
