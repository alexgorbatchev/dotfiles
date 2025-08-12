import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import stripAnsi from 'strip-ansi';
import { processBunTestOutput } from '../bun-test-runner';

function getFixtureContent(fixtureName: string): string {
  return readFileSync(`${__dirname}/fixtures/bun-test-runner--${fixtureName}.txt`, {
    encoding: 'utf-8',
  });
}

describe('bun-test-runner', () => {
  test('no-errors', () => {
    const output = getFixtureContent('no-errors');
    const results = processBunTestOutput(output);
    expect(stripAnsi(results)).toMatchInlineSnapshot(`
        "
        Coverage Report (file_name:uncovered_lines):
        - src/__tests__/helpers.ts:115-116
        - src/cli.ts:112-115,117-136,139-145,147-152,155,259-260
        - src/modules/cli/checkUpdatesCommand.ts:121-122,143-145
        - src/modules/cli/cleanupCommand.ts:186-195,208-227
        - src/modules/cli/detectConflictsCommand.ts:158-178
        - src/modules/cli/generateCommand.ts:100-108,110,114-115,119-122,130-139
        - src/modules/cli/updateCommand.ts:119-120,194-196,198-199
        - src/modules/config-loader/loadToolConfigs.ts:16-105,116-173
        - src/modules/config-loader/toolConfigLoader.ts:134-135
        - src/modules/config/toolConfigSchema.ts:181-188,250-272
        - src/modules/file-system/MemFileSystem.ts:135-140
        - src/modules/file-system/NodeFileSystem.ts:49-52
        - src/modules/generator-shim/ShimGenerator.ts:174-218
        - src/modules/tool-config-builder/toolConfigBuilder.ts:147-148
        - src/testing-helpers/bun-preload.ts:6-8
        - src/testing-helpers/createMockFileSystem.ts:108-194
        - src/types/platform.types.ts:50-54,64-71

         453 pass
         0 fail
         1298 expect() calls
        Ran 453 tests across 36 files. [1.94s]
        "
      `);
  });

  test('no-errors--one-skipped', () => {
    const output = getFixtureContent('no-errors--one-skipped');
    const results = processBunTestOutput(output);
    expect(stripAnsi(results)).toMatchInlineSnapshot(`
        "
        Coverage Report (file_name:uncovered_lines):
        - src/__tests__/helpers.ts:115-116
        - src/cli.ts:112-115,117-136,139-145,147-152,155,259-260
        - src/modules/cli/checkUpdatesCommand.ts:121-122,143-145
        - src/modules/cli/cleanupCommand.ts:186-195,208-227
        - src/modules/cli/detectConflictsCommand.ts:158-178
        - src/modules/cli/generateCommand.ts:100-108,110,114-115,119-122,130-139
        - src/modules/cli/updateCommand.ts:119-120,194-196,198-199
        - src/modules/config-loader/loadToolConfigs.ts:16-105,116-173
        - src/modules/config-loader/toolConfigLoader.ts:134-135
        - src/modules/config/toolConfigSchema.ts:181-188,250-272
        - src/modules/file-system/MemFileSystem.ts:135-140
        - src/modules/file-system/NodeFileSystem.ts:49-52
        - src/modules/generator-shim/ShimGenerator.ts:174-218
        - src/modules/tool-config-builder/toolConfigBuilder.ts:147-148
        - src/testing-helpers/bun-preload.ts:6-8
        - src/testing-helpers/createMockFileSystem.ts:108-194
        - src/types/platform.types.ts:50-54,64-71

         453 pass
         1 skip
         0 fail
         1298 expect() calls
        Ran 454 tests across 36 files. [1.97s]
        "
      `);
  });

  test('same-file--one-failing', () => {
    const output = getFixtureContent('same-file--one-failing');
    const results = processBunTestOutput(output);
    expect(stripAnsi(results)).toMatchInlineSnapshot(`
        "src/__tests__/cli.test.ts:
        517 |     expect(loggerMocks.error).toHaveBeenCalledTimes(2);
        518 |     expect(loggerMocks.error).toHaveBeenNthCalledWith(1, 'Error during tool installation: %s', 'undefined is not an object (evaluating \\'result.success\\')');
        519 |     expect(loggerMocks.error).toHaveBeenNthCalledWith(2, 'Critical error in install command: %s', 'TEST_EXIT_CLI_CALLED_WITH_1');
        520 | 
        521 |     // console.error in main()'s catch block should have been called
        522 |     expect(consoleErrorSpy).toHaveBeenCalledWith('Error during main CLI execution:', new Error('TEST_EXIT_CLI_CALLED_WITH_1'));
                                          ^
        error: expect(received).toHaveBeenCalledWith(expected)

        Number of calls: 0

              at <anonymous> (/Users/user/.dotfiles/generator/src/__tests__/cli.test.ts:522:29)
        (fail) CLI > main function should trigger process.exit when setupServices in action handler fails [1.18ms]

        Coverage Report (file_name:uncovered_lines):
        - src/__tests__/helpers.ts:115-116
        - src/cli.ts:112-115,117-136,139-145,147-152,155,259-260
        - src/modules/cli/checkUpdatesCommand.ts:121-122,143-145
        - src/modules/cli/cleanupCommand.ts:186-195,208-227
        - src/modules/cli/detectConflictsCommand.ts:158-178
        - src/modules/cli/generateCommand.ts:100-108,110,114-115,119-122,130-139
        - src/modules/cli/updateCommand.ts:119-120,194-196,198-199
        - src/modules/config-loader/loadToolConfigs.ts:16-105,116-173
        - src/modules/config-loader/toolConfigLoader.ts:134-135
        - src/modules/config/toolConfigSchema.ts:181-188,250-272
        - src/modules/file-system/MemFileSystem.ts:135-140
        - src/modules/file-system/NodeFileSystem.ts:49-52
        - src/modules/generator-shim/ShimGenerator.ts:174-218
        - src/modules/tool-config-builder/toolConfigBuilder.ts:147-148
        - src/testing-helpers/bun-preload.ts:6-8
        - src/testing-helpers/createMockFileSystem.ts:108-194
        - src/types/platform.types.ts:50-54,64-71

         453 pass
         1 fail
         2 errors
         1304 expect() calls
        Ran 454 tests across 36 files. [1.89s]
        "
      `);
  });

  test('same-file--two-failing', () => {
    const output = getFixtureContent('same-file--two-failing');
    const results = processBunTestOutput(output);
    expect(stripAnsi(results)).toMatchInlineSnapshot(`
        "src/__tests__/cli.test.ts:
        428 |     );
        429 |     const expectedArgForGenerateAllAfterDryRun = {
        430 |         'fzf': fzfConfigObjectForImportMock,
        431 |         'lazygit': lazygitConfigObjectForImportMock,
        432 |     };
        433 |     expect(mockGenerateAll).not.toHaveBeenCalledWith(expectedArgForGenerateAllAfterDryRun, {});
                                              ^
        error: expect(received).not.toHaveBeenCalledWith(expected)

        Number of calls: 1

              at <anonymous> (/Users/user/.dotfiles/generator/src/__tests__/cli.test.ts:433:33)
        (fail) CLI > generate command with --dry-run should call generateActionLogic with MemFileSystem [1.61ms]
        456 |     const callArgs = loggerMocks.error.mock.calls[0] as [string, string];
        457 |     const [loggedFormatString, loggedMessage] = callArgs;
        458 |     expect(loggedFormatString).toBe('Critical error in generate command: %s');
        459 |     expect(loggedMessage).toBe(testError.message);
        460 | 
        461 |     expect(exitCliSpy).toHaveBeenCalledWith(0);
                                     ^
        error: expect(received).toHaveBeenCalledWith(expected)

        Number of calls: 1

              at <anonymous> (/Users/user/.dotfiles/generator/src/__tests__/cli.test.ts:461:24)
        (fail) CLI > generate command should handle errors from generateActionLogic and exit [0.56ms]

        Coverage Report (file_name:uncovered_lines):
        - src/__tests__/helpers.ts:115-116
        - src/cli.ts:112-115,117-136,139-145,147-152,155,259-260
        - src/modules/cli/checkUpdatesCommand.ts:121-122,143-145
        - src/modules/cli/cleanupCommand.ts:186-195,208-227
        - src/modules/cli/detectConflictsCommand.ts:158-178
        - src/modules/cli/generateCommand.ts:100-108,110,114-115,119-122,130-139
        - src/modules/cli/updateCommand.ts:119-120,194-196,198-199
        - src/modules/config-loader/loadToolConfigs.ts:16-105,116-173
        - src/modules/config-loader/toolConfigLoader.ts:134-135
        - src/modules/config/toolConfigSchema.ts:181-188,250-272
        - src/modules/file-system/MemFileSystem.ts:135-140
        - src/modules/file-system/NodeFileSystem.ts:49-52
        - src/modules/generator-shim/ShimGenerator.ts:174-218
        - src/modules/tool-config-builder/toolConfigBuilder.ts:147-148
        - src/testing-helpers/bun-preload.ts:6-8
        - src/testing-helpers/createMockFileSystem.ts:108-194
        - src/types/platform.types.ts:50-54,64-71

         451 pass
         1 skip
         2 fail
         1297 expect() calls
        Ran 454 tests across 36 files. [1.96s]
        "
      `);
  });

  test('two-files--two-failing', () => {
    const output = getFixtureContent('two-files--two-failing');
    const results = processBunTestOutput(output);
    expect(stripAnsi(results)).toMatchInlineSnapshot(`
        "src/__tests__/cli-install.e2e.test.ts:
        184 |     it('should create a symlink to the downloaded binary', () => {
        185 |       expect(fs.existsSync(symlinkPath)).toBe(true);
        186 |     });
        187 |     it('should verify the downloaded binary works via symlink', () => {
        188 |       const proc = Bun.spawnSync([symlinkPath], { stdout: 'pipe', env: { HOME: tempDir } });
        189 |       expect(proc.exitCode).toBe(2);
                                          ^
        error: expect(received).toBe(expected)

        Expected: 2
        Received: 0

              at <anonymous> (/Users/user/.dotfiles/generator/src/__tests__/cli-install.e2e.test.ts:189:29)
        (fail) E2E: bun run cli install > downloaded direct binary (GitHub Release with Mock Server) > should verify the downloaded binary works via symlink [175.42ms]
        src/__tests__/cli.test.ts:
        456 |     const callArgs = loggerMocks.error.mock.calls[0] as [string, string];
        457 |     const [loggedFormatString, loggedMessage] = callArgs;
        458 |     expect(loggedFormatString).toBe('Critical error in generate command: %s');
        459 |     expect(loggedMessage).toBe(testError.message);
        460 | 
        461 |     expect(exitCliSpy).toHaveBeenCalledWith(0);
                                     ^
        error: expect(received).toHaveBeenCalledWith(expected)

        Number of calls: 1

              at <anonymous> (/Users/user/.dotfiles/generator/src/__tests__/cli.test.ts:461:24)
        (fail) CLI > generate command should handle errors from generateActionLogic and exit [0.90ms]

        Coverage Report (file_name:uncovered_lines):
        - src/__tests__/helpers.ts:115-116
        - src/cli.ts:112-115,117-136,139-145,147-152,155,259-260
        - src/modules/cli/checkUpdatesCommand.ts:121-122,143-145
        - src/modules/cli/cleanupCommand.ts:186-195,208-227
        - src/modules/cli/detectConflictsCommand.ts:158-178
        - src/modules/cli/generateCommand.ts:100-108,110,114-115,119-122,130-139
        - src/modules/cli/updateCommand.ts:119-120,194-196,198-199
        - src/modules/config-loader/loadToolConfigs.ts:16-105,116-173
        - src/modules/config-loader/toolConfigLoader.ts:134-135
        - src/modules/config/toolConfigSchema.ts:181-188,250-272
        - src/modules/file-system/MemFileSystem.ts:135-140
        - src/modules/file-system/NodeFileSystem.ts:49-52
        - src/modules/generator-shim/ShimGenerator.ts:174-218
        - src/modules/tool-config-builder/toolConfigBuilder.ts:147-148
        - src/testing-helpers/bun-preload.ts:6-8
        - src/testing-helpers/createMockFileSystem.ts:108-194
        - src/types/platform.types.ts:50-54,64-71

         451 pass
         1 skip
         2 fail
         1297 expect() calls
        Ran 454 tests across 36 files. [2.03s]
        "
      `);
  });

  test('same-file--one-failing-with-unhandled-error', () => {
    const output = getFixtureContent('same-file--one-failing-with-unhandled-error');
    const results = processBunTestOutput(output);
    expect(stripAnsi(results)).toMatchInlineSnapshot(`
      "src/__tests__/cli.test.ts:
      517 |     expect(loggerMocks.error).toHaveBeenCalledTimes(2);
      518 |     expect(loggerMocks.error).toHaveBeenNthCalledWith(1, 'Error during tool installation: %s', 'undefined is not an object (evaluating \\'result.success\\')');
      519 |     expect(loggerMocks.error).toHaveBeenNthCalledWith(2, 'Critical error in install command: %s', 'TEST_EXIT_CLI_CALLED_WITH_1');
      520 | 
      521 |     // console.error in main()'s catch block should have been called
      522 |     expect(consoleErrorSpy).toHaveBeenCalledWith('Error during main CLI execution:', new Error('TEST_EXIT_CLI_CALLED_WITH_1'));
                                        ^
      error: expect(received).toHaveBeenCalledWith(expected)

      Number of calls: 0

            at <anonymous> (/Users/user/.dotfiles/generator/src/__tests__/cli.test.ts:522:29)
      (fail) CLI > main function should trigger process.exit when setupServices in action handler fails [1.18ms]
      # Unhandled error between tests
      ---
      471 |     // It verifies that the error propagates correctly, clientLogger.error is called, and the CLI exits.
      472 | 
      473 |     setupServicesSpy.mockClear(); // Clear any calls from beforeEach's registerAllCommands
      474 |     mockInstall.mockClear();      // Clear the general mockInstall, not directly used but good practice
      475 | 
      476 |     const specificTestError = new Error('SetupServices in install action failed for this specific test!');
                                          ^
      error: SetupServices in install action failed for this specific test!
            at <anonymous> (/Users/user/.dotfiles/generator/src/__tests__/cli.test.ts:476:31)
            at <anonymous> (/Users/user/.dotfiles/generator/src/__tests__/cli.test.ts:469:96)
      ---
      # Unhandled error between tests
      ---
      517 |     expect(loggerMocks.error).toHaveBeenCalledTimes(2);
      518 |     expect(loggerMocks.error).toHaveBeenNthCalledWith(1, 'Error during tool installation: %s', 'undefined is not an object (evaluating \\'result.success\\')');
      519 |     expect(loggerMocks.error).toHaveBeenNthCalledWith(2, 'Critical error in install command: %s', 'TEST_EXIT_CLI_CALLED_WITH_1');
      520 | 
      521 |     // console.error in main()'s catch block should have been called
      522 |     expect(consoleErrorSpy).toHaveBeenCalledWith('Error during main CLI execution:', new Error('TEST_EXIT_CLI_CALLED_WITH_1'));
                                        ^
      error: expect(received).toHaveBeenCalledWith(expected)

      Number of calls: 0

            at <anonymous> (/Users/user/.dotfiles/generator/src/__tests__/cli.test.ts:522:29)
      ---

      Coverage Report (file_name:uncovered_lines):
      - src/__tests__/helpers.ts:115-116
      - src/cli.ts:112-115,117-136,139-145,147-152,155,259-260
      - src/modules/cli/checkUpdatesCommand.ts:121-122,143-145
      - src/modules/cli/cleanupCommand.ts:186-195,208-227
      - src/modules/cli/detectConflictsCommand.ts:158-178
      - src/modules/cli/generateCommand.ts:100-108,110,114-115,119-122,130-139
      - src/modules/cli/updateCommand.ts:119-120,194-196,198-199
      - src/modules/config-loader/loadToolConfigs.ts:16-105,116-173
      - src/modules/config-loader/toolConfigLoader.ts:134-135
      - src/modules/config/toolConfigSchema.ts:181-188,250-272
      - src/modules/file-system/MemFileSystem.ts:135-140
      - src/modules/file-system/NodeFileSystem.ts:49-52
      - src/modules/generator-shim/ShimGenerator.ts:174-218
      - src/modules/tool-config-builder/toolConfigBuilder.ts:147-148
      - src/testing-helpers/bun-preload.ts:6-8
      - src/testing-helpers/createMockFileSystem.ts:108-194
      - src/types/platform.types.ts:50-54,64-71

       453 pass
       1 fail
       2 errors
       1304 expect() calls
      Ran 454 tests across 36 files. [1.89s]
      "
    `);
  });
});
