import { TestLogger } from "@dotfiles/logger";
import { beforeEach, describe, it } from "bun:test";
import { createLoggingShell } from "../createLoggingShell";
import { createShell } from "../createShell";
import type { Shell } from "../types";

describe("createLoggingShell (wrapping)", () => {
  let logger: TestLogger;
  let baseShell: Shell;

  beforeEach(() => {
    logger = new TestLogger({ name: "ShellTest" });
    baseShell = createShell();
  });

  it("logs the command when wrapping a non-logging shell", async () => {
    const loggingShell = createLoggingShell(baseShell, logger);
    await loggingShell`echo hello`.quiet();

    // Should log the command (but output comes from base shell which has no logger)
    logger.expect(["INFO"], ["ShellTest"], [], ["$ echo hello"]);
  });

  it("preserves shell chaining with .cwd()", async () => {
    const loggingShell = createLoggingShell(baseShell, logger);
    await loggingShell`pwd`.cwd("/tmp").quiet();

    // On macOS, /tmp is a symlink to /private/tmp
    logger.expect(["INFO"], ["ShellTest"], [], ["$ pwd"]);
  });

  it("preserves shell chaining with .env()", async () => {
    const loggingShell = createLoggingShell(baseShell, logger);
    await loggingShell`echo $TEST_VAR`.env({ TEST_VAR: "test-value" }).quiet();

    logger.expect(["INFO"], ["ShellTest"], [], ["$ echo $TEST_VAR"]);
  });

  it("handles template expressions correctly", async () => {
    const loggingShell = createLoggingShell(baseShell, logger);
    const name = "world";
    await loggingShell`echo hello ${name}`.quiet();

    logger.expect(["INFO"], ["ShellTest"], [], ["$ echo hello world"]);
  });

  it("handles array expressions in template", async () => {
    const loggingShell = createLoggingShell(baseShell, logger);
    const args: string[] = ["arg1", "arg2", "arg3"];
    await loggingShell`echo ${args}`.quiet();

    logger.expect(["INFO"], ["ShellTest"], [], ["$ echo arg1 arg2 arg3"]);
  });
});
