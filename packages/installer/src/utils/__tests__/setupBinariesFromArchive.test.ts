import type { IInstallContext, ToolConfig } from "@dotfiles/core";
import { beforeEach, describe, expect, it } from "bun:test";
import path from "node:path";
import { createInstallerTestSetup, type IInstallerTestSetup } from "../../__tests__/installer-test-helpers";
import { setupBinariesFromArchive } from "../setupBinariesFromArchive";

describe("setupBinariesFromArchive", () => {
  let setup: IInstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
  });

  it("returns stable entrypoint paths for nested binaries with custom names", async () => {
    const toolName = "go";
    const version = "1.26.2";
    const stagingDir = path.join(setup.testDirs.paths.binariesDir, toolName, version);
    const nestedBinaryPath = path.join(stagingDir, "go", "bin", "go");

    await setup.fs.ensureDir(path.dirname(nestedBinaryPath));
    await setup.fs.writeFile(nestedBinaryPath, "#!/bin/sh\nexit 0\n");
    await setup.fs.chmod(nestedBinaryPath, 0o755);

    const toolConfig: ToolConfig = {
      name: toolName,
      binaries: [{ name: "go-real", pattern: "go/bin/go" }],
      version,
      installationMethod: "curl-tar",
      installParams: {
        url: "https://example.com/go.tar.gz",
      },
    } as ToolConfig;

    const context = {
      projectConfig: setup.mockProjectConfig,
      stagingDir,
    } as IInstallContext;

    const binaryPaths = await setupBinariesFromArchive(
      setup.fs,
      toolName,
      toolConfig,
      context,
      stagingDir,
      setup.logger,
    );

    const entrypointPath = path.join(
      setup.mockProjectConfig.paths.generatedDir,
      "binaries",
      toolName,
      version,
      "go-real",
    );

    expect(binaryPaths).toEqual([entrypointPath]);
    expect(await setup.fs.readlink(entrypointPath)).toBe("go/bin/go");
  });
});
