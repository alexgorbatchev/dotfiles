import { createShell } from "@dotfiles/core";
import { TestLogger } from "@dotfiles/logger";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CompletionCommandExecutor } from "../CompletionCommandExecutor";

/**
 * These tests verify that CompletionCommandExecutor properly validates binary existence
 * before executing completion commands. This prevents infinite loops when:
 *
 * 1. User sources main.zsh
 * 2. main.zsh runs `eval "$(fnm env --use-on-cd)"`
 * 3. fnm shim is executed (since fnm is first in PATH)
 * 4. Shim sees binary doesn't exist → runs install
 * 5. Install completes (thinks it's already installed from registry)
 * 6. Completion generation runs `fnm completions --shell zsh`
 * 7. Without binary check: command runs via shim → triggers install again → INFINITE LOOP
 * 8. With binary check: fails fast with clear error → no loop
 */
describe("CompletionCommandExecutor - binary existence validation", () => {
  const shell = createShell();
  let logger: TestLogger;
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "completion-binary-check-"));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    logger = new TestLogger();
  });

  test("should fail fast when binaryPaths is provided but points to non-existent file", async () => {
    // Arrange: workingDir exists but binaryPaths points to non-existent binary
    // This simulates a corrupted installation where registry says installed but binary is missing
    const workingDir = path.join(tempDir, "fnm-current");
    const missingBinaryPath = path.join(workingDir, "fnm");
    fs.mkdirSync(workingDir, { recursive: true });
    fs.writeFileSync(path.join(workingDir, "fnm-install.sh"), '#!/bin/sh\necho "installer"');
    // Note: NOT creating the actual fnm binary

    const executor = new CompletionCommandExecutor(logger, shell);

    // Act & Assert: Should throw before attempting to run the command
    // Without this check, it would try to run 'fnm completions --shell zsh' which
    // would fall through to system PATH or shim, causing infinite loop
    await expect(
      executor.executeCompletionCommand(
        "fnm completions --shell zsh",
        "fnm",
        "zsh",
        workingDir,
        [missingBinaryPath], // binaryPaths points to expected location, but file doesn't exist
      ),
    ).rejects.toThrow(/None of the expected binaries.*fnm.*found in/i);
  });

  test("should fail fast when binaryPaths point to non-existent files", async () => {
    // Arrange
    const workingDir = path.join(tempDir, "mytool-current");
    fs.mkdirSync(workingDir, { recursive: true });

    const executor = new CompletionCommandExecutor(logger, shell);

    // Act & Assert
    await expect(
      executor.executeCompletionCommand(
        "mytool completions",
        "mytool",
        "zsh",
        workingDir,
        ["/nonexistent/path/mytool"], // binaryPaths points to non-existent file
      ),
    ).rejects.toThrow(/None of the expected binaries.*mytool.*found in/i);
  });

  test("should succeed when binary exists in binaryPaths", async () => {
    // Arrange: Create a real binary file
    const binaryDir = path.join(tempDir, "real-bin");
    const binaryPath = path.join(binaryDir, "mytool");
    const workingDir = path.join(tempDir, "workdir");

    fs.mkdirSync(binaryDir, { recursive: true });
    fs.mkdirSync(workingDir, { recursive: true });
    fs.writeFileSync(binaryPath, '#!/bin/sh\necho "completion output"');
    fs.chmodSync(binaryPath, 0o755);

    const executor = new CompletionCommandExecutor(logger, shell);

    // Act: Use echo as the command (since mytool doesn't actually generate completions)
    const result = await executor.executeCompletionCommand('echo "completion output"', "mytool", "zsh", workingDir, [
      binaryPath,
    ]);

    // Assert
    expect(result).toContain("completion output");
  });

  test("should succeed when binary exists in workingDir (github-release style)", async () => {
    // Arrange: Binary is in workingDir (typical for github-release installs)
    const workingDir = path.join(tempDir, "fzf-current");
    const binaryPath = path.join(workingDir, "fzf");

    fs.mkdirSync(workingDir, { recursive: true });
    fs.writeFileSync(binaryPath, '#!/bin/sh\necho "fzf completions"');
    fs.chmodSync(binaryPath, 0o755);

    const executor = new CompletionCommandExecutor(logger, shell);

    // Act
    const result = await executor.executeCompletionCommand('echo "fzf completion"', "fzf", "zsh", workingDir, [
      binaryPath,
    ]);

    // Assert
    expect(result).toContain("fzf completion");
  });

  test("should prepend binaryPaths directories to PATH before workingDir", async () => {
    // Arrange: Create a binary that outputs where it was found
    const binaryDir = path.join(tempDir, "custom-bin");
    const binaryPath = path.join(binaryDir, "mytool2");
    const workingDir = path.join(tempDir, "workdir2");

    fs.mkdirSync(binaryDir, { recursive: true });
    fs.mkdirSync(workingDir, { recursive: true });
    fs.writeFileSync(binaryPath, '#!/bin/sh\necho "found in custom-bin"');
    fs.chmodSync(binaryPath, 0o755);

    const executor = new CompletionCommandExecutor(logger, shell);

    // Act: Run the actual binary to prove it's found
    const result = await executor.executeCompletionCommand("mytool2", "mytool2", "zsh", workingDir, [binaryPath]);

    // Assert
    expect(result).toContain("found in custom-bin");
  });
});
