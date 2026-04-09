import { Architecture, Platform } from "@dotfiles/core";

import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { TestHarness } from "./helpers/TestHarness";

const ORIGINAL_TOOL_CONFIG =
  "import { defineTool } from '@dotfiles/cli';\n\nexport default defineTool((install) =>\n  install().symlink('./config.txt', '~/.config/renameable-tool/config.txt')\n);\n";

describe("E2E: tool rename cleanup", () => {
  const harness = new TestHarness({
    testDir: import.meta.dir,
    configPath: "fixtures/tool-rename/config.ts",
    platform: Platform.MacOS,
    architecture: Architecture.Arm64,
  });

  const toolDir = path.join(import.meta.dir, "fixtures/tool-rename/tools/renameable-tool");
  const oldToolConfigPath = path.join(toolDir, "old-tool.tool.ts");
  const newToolConfigPath = path.join(toolDir, "new-tool.tool.ts");

  it("should stop reporting orphan cleanup after the renamed tool is cleaned once", async () => {
    await harness.clean();
    await fs.promises.rm(newToolConfigPath, { force: true });
    await fs.promises.writeFile(oldToolConfigPath, ORIGINAL_TOOL_CONFIG);

    try {
      const initialGenerateResult = await harness.generate();
      expect(initialGenerateResult.code).toBe(0);

      await fs.promises.rename(oldToolConfigPath, newToolConfigPath);

      const cleanupGenerateResult = await harness.generate();
      expect(cleanupGenerateResult.code).toBe(0);

      const repeatedGenerateResult = await harness.generate();
      expect(repeatedGenerateResult.code).toBe(0);
      expect(repeatedGenerateResult.stdout).toBe(
        ["WARN\tPlatform overridden to: macos", "WARN\tArch overridden to: arm64", "INFO\tDONE"].join("\n"),
      );
    } finally {
      await fs.promises.rm(newToolConfigPath, { force: true });
      await fs.promises.writeFile(oldToolConfigPath, ORIGINAL_TOOL_CONFIG);
      await harness.clean();
    }
  });
});
