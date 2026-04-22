import { TestLogger } from "@dotfiles/logger";
import { afterEach, describe, expect, it, spyOn } from "bun:test";
import assert from "node:assert";
import { setupServices } from "../cli";

describe("setupServices DEV_PROXY validation", () => {
  const originalDevProxy = process.env["DEV_PROXY"];

  afterEach(() => {
    const restoreDevProxy = new Map<boolean, VoidFunction>([
      [
        true,
        () => {
          process.env["DEV_PROXY"] = originalDevProxy ?? "";
        },
      ],
      [
        false,
        () => {
          delete process.env["DEV_PROXY"];
        },
      ],
    ]).get(typeof originalDevProxy === "string");

    assert(restoreDevProxy);
    restoreDevProxy();
  });

  it("fails fast when DEV_PROXY is invalid", async () => {
    process.env["DEV_PROXY"] = "abc";

    const exitSpy = spyOn(process, "exit").mockImplementation(((code?: number) => {
      assert.fail(`EXIT:${code}`);
    }) as typeof process.exit);

    try {
      const logger = new TestLogger({ name: "test" });

      await expect(
        setupServices(logger, {
          config: "test-project-npm/dotfiles.config.ts",
          dryRun: false,
          log: "info",
          verbose: false,
          quiet: false,
          trace: false,
          cwd: process.cwd(),
          env: process.env,
        }),
      ).rejects.toThrow("EXIT:1");

      expect(exitSpy).toHaveBeenCalledWith(1);
      logger.expect(
        ["ERROR"],
        ["test", "setupServices"],
        [],
        ['Invalid DEV_PROXY: "abc" (expected an integer between 1 and 65535)'],
      );
    } finally {
      exitSpy.mockRestore();
    }
  });
});
