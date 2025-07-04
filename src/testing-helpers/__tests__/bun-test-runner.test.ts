import stripAnsi from 'strip-ansi';
import { describe, expect, test } from 'bun:test';
import { createReadStream } from 'node:fs';
import { Readable } from 'stream';
import { BunTestOutputParser } from '../bun-test-runner';
import * as readline from 'node:readline';

function streamLines(fixtureName: string): Readable {
  const fileStream = createReadStream(`${__dirname}/fixtures/bun-test-runner--${fixtureName}.txt`, {
    encoding: 'utf-8',
  });

  const lineStream = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  return Readable.from(lineStream);
}

function run(fixtureName: string, cb: (results: string) => void) {
  const stream = streamLines(fixtureName);
  const transformer = new BunTestOutputParser();
  let content = '';
  stream.pipe(transformer).on('data', (chunk: Buffer | string) => {
    content += chunk.toString();
  });
  stream.on('end', () => {
    cb(stripAnsi(content));
  });
}

describe('bun-test-runner', () => {
    test('no-errors', (done) => {
      run('no-errors', (results) => {
        expect(results).toMatchInlineSnapshot(`
          "-------------------------------------------------------------------------------|---------|---------|-------------------
          File                                                                           | % Funcs | % Lines | Uncovered Line #s
          -------------------------------------------------------------------------------|---------|---------|-------------------
           src/__tests__/helpers.ts                                                      |  100.00 |   93.48 | 115-116
           src/cli.ts                                                                    |   87.50 |   70.71 | 112-115,117-136,139-145,147-152,155,259-260
           src/modules/cli/checkUpdatesCommand.ts                                        |  100.00 |   95.33 | 121-122,143-145
           src/modules/cli/cleanupCommand.ts                                             |   71.43 |   79.87 | 186-195,208-227
           src/modules/cli/detectConflictsCommand.ts                                     |   80.00 |   80.73 | 158-178
           src/modules/cli/generateCommand.ts                                            |   62.50 |   75.89 | 100-108,110,114-115,119-122,130-139
           src/modules/cli/updateCommand.ts                                              |  100.00 |   94.02 | 119-120,194-196,198-199
           src/modules/config-loader/loadToolConfigs.ts                                  |    0.00 |    3.27 | 16-105,116-173
           src/modules/config-loader/toolConfigLoader.ts                                 |  100.00 |   97.83 | 134-135
           src/modules/config/toolConfigSchema.ts                                        |    0.00 |   82.49 | 181-188,250-272
           src/modules/file-system/MemFileSystem.ts                                      |   96.88 |   91.67 | 135-140
           src/modules/file-system/NodeFileSystem.ts                                     |   93.33 |   91.49 | 49-52
           src/modules/generator-shim/ShimGenerator.ts                                   |   83.33 |   68.31 | 174-218
           src/modules/tool-config-builder/toolConfigBuilder.ts                          |   90.91 |   98.58 | 147-148
           src/testing-helpers/bun-preload.ts                                            |  100.00 |   66.67 | 6-8
           src/testing-helpers/createMockFileSystem.ts                                   |   68.18 |   39.58 | 108-194
           src/types/platform.types.ts                                                   |   50.00 |   53.57 | 50-54,64-71
          -------------------------------------------------------------------------------|---------|---------|-------------------
           453 pass
           1298 expect() calls
          Ran 453 tests across 36 files. [1.94s]
          "
        `);
        done();
      });
    });

    test('no-errors--one-skipped', (done) => {
      run('no-errors--one-skipped', (results) => {
        expect(results).toMatchInlineSnapshot(`
          "-------------------------------------------------------------------------------|---------|---------|-------------------
          File                                                                           | % Funcs | % Lines | Uncovered Line #s
          -------------------------------------------------------------------------------|---------|---------|-------------------
           src/__tests__/helpers.ts                                                      |  100.00 |   93.48 | 115-116
           src/cli.ts                                                                    |   87.50 |   70.71 | 112-115,117-136,139-145,147-152,155,259-260
           src/modules/cli/checkUpdatesCommand.ts                                        |  100.00 |   95.33 | 121-122,143-145
           src/modules/cli/cleanupCommand.ts                                             |   71.43 |   79.87 | 186-195,208-227
           src/modules/cli/detectConflictsCommand.ts                                     |   80.00 |   80.73 | 158-178
           src/modules/cli/generateCommand.ts                                            |   62.50 |   75.89 | 100-108,110,114-115,119-122,130-139
           src/modules/cli/updateCommand.ts                                              |  100.00 |   94.02 | 119-120,194-196,198-199
           src/modules/config-loader/loadToolConfigs.ts                                  |    0.00 |    3.27 | 16-105,116-173
           src/modules/config-loader/toolConfigLoader.ts                                 |  100.00 |   97.83 | 134-135
           src/modules/config/toolConfigSchema.ts                                        |    0.00 |   82.49 | 181-188,250-272
           src/modules/file-system/MemFileSystem.ts                                      |   96.88 |   91.67 | 135-140
           src/modules/file-system/NodeFileSystem.ts                                     |   93.33 |   91.49 | 49-52
           src/modules/generator-shim/ShimGenerator.ts                                   |   83.33 |   68.31 | 174-218
           src/modules/tool-config-builder/toolConfigBuilder.ts                          |   90.91 |   98.58 | 147-148
           src/testing-helpers/bun-preload.ts                                            |  100.00 |   66.67 | 6-8
           src/testing-helpers/createMockFileSystem.ts                                   |   68.18 |   39.58 | 108-194
           src/types/platform.types.ts                                                   |   50.00 |   53.57 | 50-54,64-71
          -------------------------------------------------------------------------------|---------|---------|-------------------
           453 pass
           1 skip
           1298 expect() calls
          Ran 454 tests across 36 files. [1.97s]
          "
        `);
        done();
      });
    });

    test('same-file--one-failing', (done) => {
      run('same-file--one-failing', (results) => {
        expect(results).toMatchInlineSnapshot(`
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

                at <anonymous> (/Users/alex/.dotfiles/generator/src/__tests__/cli.test.ts:522:29)
          (fail) CLI > main function should trigger process.exit when setupServices in action handler fails [1.18ms]
          -------------------------------------------------------------------------------|---------|---------|-------------------
          File                                                                           | % Funcs | % Lines | Uncovered Line #s
          -------------------------------------------------------------------------------|---------|---------|-------------------
           src/__tests__/helpers.ts                                                      |  100.00 |   93.48 | 115-116
           src/cli.ts                                                                    |   87.50 |   70.71 | 112-115,117-136,139-145,147-152,155,259-260
           src/modules/cli/checkUpdatesCommand.ts                                        |  100.00 |   95.33 | 121-122,143-145
           src/modules/cli/cleanupCommand.ts                                             |   71.43 |   79.87 | 186-195,208-227
           src/modules/cli/detectConflictsCommand.ts                                     |   80.00 |   80.73 | 158-178
           src/modules/cli/generateCommand.ts                                            |   62.50 |   75.89 | 100-108,110,114-115,119-122,130-139
           src/modules/cli/updateCommand.ts                                              |  100.00 |   94.02 | 119-120,194-196,198-199
           src/modules/config-loader/loadToolConfigs.ts                                  |    0.00 |    3.27 | 16-105,116-173
           src/modules/config-loader/toolConfigLoader.ts                                 |  100.00 |   97.83 | 134-135
           src/modules/config/toolConfigSchema.ts                                        |    0.00 |   82.49 | 181-188,250-272
           src/modules/file-system/MemFileSystem.ts                                      |   96.88 |   91.67 | 135-140
           src/modules/file-system/NodeFileSystem.ts                                     |   93.33 |   91.49 | 49-52
           src/modules/generator-shim/ShimGenerator.ts                                   |   83.33 |   68.31 | 174-218
           src/modules/tool-config-builder/toolConfigBuilder.ts                          |   90.91 |   98.58 | 147-148
           src/testing-helpers/bun-preload.ts                                            |  100.00 |   66.67 | 6-8
           src/testing-helpers/createMockFileSystem.ts                                   |   68.18 |   39.58 | 108-194
           src/types/platform.types.ts                                                   |   50.00 |   53.57 | 50-54,64-71
          -------------------------------------------------------------------------------|---------|---------|-------------------
           453 pass
           1 fail
           2 errors
           1304 expect() calls
          Ran 454 tests across 36 files. [1.89s]
          "
        `);
        done();
      });
    });

    test('same-file--two-failing', (done) => {
      run('same-file--two-failing', (results) => {
        expect(results).toMatchInlineSnapshot(`
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

                at <anonymous> (/Users/alex/.dotfiles/generator/src/__tests__/cli.test.ts:433:33)
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

                at <anonymous> (/Users/alex/.dotfiles/generator/src/__tests__/cli.test.ts:461:24)
          (fail) CLI > generate command should handle errors from generateActionLogic and exit [0.56ms]
          -------------------------------------------------------------------------------|---------|---------|-------------------
          File                                                                           | % Funcs | % Lines | Uncovered Line #s
          -------------------------------------------------------------------------------|---------|---------|-------------------
           src/__tests__/helpers.ts                                                      |  100.00 |   93.48 | 115-116
           src/cli.ts                                                                    |   87.50 |   70.71 | 112-115,117-136,139-145,147-152,155,259-260
           src/modules/cli/checkUpdatesCommand.ts                                        |  100.00 |   95.33 | 121-122,143-145
           src/modules/cli/cleanupCommand.ts                                             |   71.43 |   79.87 | 186-195,208-227
           src/modules/cli/detectConflictsCommand.ts                                     |   80.00 |   80.73 | 158-178
           src/modules/cli/generateCommand.ts                                            |   62.50 |   75.89 | 100-108,110,114-115,119-122,130-139
           src/modules/cli/updateCommand.ts                                              |  100.00 |   94.02 | 119-120,194-196,198-199
           src/modules/config-loader/loadToolConfigs.ts                                  |    0.00 |    3.27 | 16-105,116-173
           src/modules/config-loader/toolConfigLoader.ts                                 |  100.00 |   97.83 | 134-135
           src/modules/config/toolConfigSchema.ts                                        |    0.00 |   82.49 | 181-188,250-272
           src/modules/file-system/MemFileSystem.ts                                      |   96.88 |   91.67 | 135-140
           src/modules/file-system/NodeFileSystem.ts                                     |   93.33 |   91.49 | 49-52
           src/modules/generator-shim/ShimGenerator.ts                                   |   83.33 |   68.31 | 174-218
           src/modules/tool-config-builder/toolConfigBuilder.ts                          |   90.91 |   98.58 | 147-148
           src/testing-helpers/bun-preload.ts                                            |  100.00 |   66.67 | 6-8
           src/testing-helpers/createMockFileSystem.ts                                   |   68.18 |   39.58 | 108-194
           src/types/platform.types.ts                                                   |   50.00 |   53.57 | 50-54,64-71
          -------------------------------------------------------------------------------|---------|---------|-------------------
           451 pass
           1 skip
           2 fail
           1297 expect() calls
          Ran 454 tests across 36 files. [1.96s]
          "
        `);
        done();
      });
    });

    test('two-files--two-failing', (done) => {
      run('two-files--two-failing', (results) => {
        expect(results).toMatchInlineSnapshot(`
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

                at <anonymous> (/Users/alex/.dotfiles/generator/src/__tests__/cli-install.e2e.test.ts:189:29)
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

                at <anonymous> (/Users/alex/.dotfiles/generator/src/__tests__/cli.test.ts:461:24)
          (fail) CLI > generate command should handle errors from generateActionLogic and exit [0.90ms]
          -------------------------------------------------------------------------------|---------|---------|-------------------
          File                                                                           | % Funcs | % Lines | Uncovered Line #s
          -------------------------------------------------------------------------------|---------|---------|-------------------
           src/__tests__/helpers.ts                                                      |  100.00 |   93.48 | 115-116
           src/cli.ts                                                                    |   87.50 |   70.71 | 112-115,117-136,139-145,147-152,155,259-260
           src/modules/cli/checkUpdatesCommand.ts                                        |  100.00 |   95.33 | 121-122,143-145
           src/modules/cli/cleanupCommand.ts                                             |   71.43 |   79.87 | 186-195,208-227
           src/modules/cli/detectConflictsCommand.ts                                     |   80.00 |   80.73 | 158-178
           src/modules/cli/generateCommand.ts                                            |   62.50 |   75.89 | 100-108,110,114-115,119-122,130-139
           src/modules/cli/updateCommand.ts                                              |  100.00 |   94.02 | 119-120,194-196,198-199
           src/modules/config-loader/loadToolConfigs.ts                                  |    0.00 |    3.27 | 16-105,116-173
           src/modules/config-loader/toolConfigLoader.ts                                 |  100.00 |   97.83 | 134-135
           src/modules/config/toolConfigSchema.ts                                        |    0.00 |   82.49 | 181-188,250-272
           src/modules/file-system/MemFileSystem.ts                                      |   96.88 |   91.67 | 135-140
           src/modules/file-system/NodeFileSystem.ts                                     |   93.33 |   91.49 | 49-52
           src/modules/generator-shim/ShimGenerator.ts                                   |   83.33 |   68.31 | 174-218
           src/modules/tool-config-builder/toolConfigBuilder.ts                          |   90.91 |   98.58 | 147-148
           src/testing-helpers/bun-preload.ts                                            |  100.00 |   66.67 | 6-8
           src/testing-helpers/createMockFileSystem.ts                                   |   68.18 |   39.58 | 108-194
           src/types/platform.types.ts                                                   |   50.00 |   53.57 | 50-54,64-71
          -------------------------------------------------------------------------------|---------|---------|-------------------
           451 pass
           1 skip
           2 fail
           1297 expect() calls
          Ran 454 tests across 36 files. [2.03s]
          "
        `);
        done();
      });
    });
    
  test('same-file--one-failing-with-unhandled-error', (done) => {
    run('same-file--one-failing-with-unhandled-error', (results) => {
      expect(results).toMatchInlineSnapshot(`
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

                at <anonymous> (/Users/alex/.dotfiles/generator/src/__tests__/cli.test.ts:522:29)
          (fail) CLI > main function should trigger process.exit when setupServices in action handler fails [1.18ms]
          
          # Unhandled error between tests
          -------------------------------
          471 |     // It verifies that the error propagates correctly, clientLogger.error is called, and the CLI exits.
          472 | 
          473 |     setupServicesSpy.mockClear(); // Clear any calls from beforeEach's registerAllCommands
          474 |     mockInstall.mockClear();      // Clear the general mockInstall, not directly used but good practice
          475 | 
          476 |     const specificTestError = new Error('SetupServices in install action failed for this specific test!');
                                              ^
          error: SetupServices in install action failed for this specific test!
                at <anonymous> (/Users/alex/.dotfiles/generator/src/__tests__/cli.test.ts:476:31)
                at <anonymous> (/Users/alex/.dotfiles/generator/src/__tests__/cli.test.ts:469:96)
          -------------------------------


          # Unhandled error between tests
          -------------------------------
          517 |     expect(loggerMocks.error).toHaveBeenCalledTimes(2);
          518 |     expect(loggerMocks.error).toHaveBeenNthCalledWith(1, 'Error during tool installation: %s', 'undefined is not an object (evaluating \\'result.success\\')');
          519 |     expect(loggerMocks.error).toHaveBeenNthCalledWith(2, 'Critical error in install command: %s', 'TEST_EXIT_CLI_CALLED_WITH_1');
          520 | 
          521 |     // console.error in main()'s catch block should have been called
          522 |     expect(consoleErrorSpy).toHaveBeenCalledWith('Error during main CLI execution:', new Error('TEST_EXIT_CLI_CALLED_WITH_1'));
                                            ^
          error: expect(received).toHaveBeenCalledWith(expected)

          Number of calls: 0

                at <anonymous> (/Users/alex/.dotfiles/generator/src/__tests__/cli.test.ts:522:29)
          -------------------------------

          -------------------------------------------------------------------------------|---------|---------|-------------------
          File                                                                           | % Funcs | % Lines | Uncovered Line #s
          -------------------------------------------------------------------------------|---------|---------|-------------------
           src/__tests__/helpers.ts                                                      |  100.00 |   93.48 | 115-116
           src/cli.ts                                                                    |   87.50 |   70.71 | 112-115,117-136,139-145,147-152,155,259-260
           src/modules/cli/checkUpdatesCommand.ts                                        |  100.00 |   95.33 | 121-122,143-145
           src/modules/cli/cleanupCommand.ts                                             |   71.43 |   79.87 | 186-195,208-227
           src/modules/cli/detectConflictsCommand.ts                                     |   80.00 |   80.73 | 158-178
           src/modules/cli/generateCommand.ts                                            |   62.50 |   75.89 | 100-108,110,114-115,119-122,130-139
           src/modules/cli/updateCommand.ts                                              |  100.00 |   94.02 | 119-120,194-196,198-199
           src/modules/config-loader/loadToolConfigs.ts                                  |    0.00 |    3.27 | 16-105,116-173
           src/modules/config-loader/toolConfigLoader.ts                                 |  100.00 |   97.83 | 134-135
           src/modules/config/toolConfigSchema.ts                                        |    0.00 |   82.49 | 181-188,250-272
           src/modules/file-system/MemFileSystem.ts                                      |   96.88 |   91.67 | 135-140
           src/modules/file-system/NodeFileSystem.ts                                     |   93.33 |   91.49 | 49-52
           src/modules/generator-shim/ShimGenerator.ts                                   |   83.33 |   68.31 | 174-218
           src/modules/tool-config-builder/toolConfigBuilder.ts                          |   90.91 |   98.58 | 147-148
           src/testing-helpers/bun-preload.ts                                            |  100.00 |   66.67 | 6-8
           src/testing-helpers/createMockFileSystem.ts                                   |   68.18 |   39.58 | 108-194
           src/types/platform.types.ts                                                   |   50.00 |   53.57 | 50-54,64-71
          -------------------------------------------------------------------------------|---------|---------|-------------------
           453 pass
           1 fail
           2 errors
           1304 expect() calls
          Ran 454 tests across 36 files. [1.89s]
          "
        `);
      done();
    });
  });


    // test('many-files--no-errors', (done) => {
    //   run('many-files--no-errors', (results) => {
    //     expect(results).toMatchInlineSnapshot(
    //     `
    //       "-------------------------------------------------------------------------------|---------|---------|-------------------
    //       File                                                                           | % Funcs | % Lines | Uncovered Line #s
    //       -------------------------------------------------------------------------------|---------|---------|-------------------
    //        src/__tests__/helpers.ts                                                      |  100.00 |   93.48 | 115-116
    //        src/cli.ts                                                                    |   87.50 |   70.71 | 112-115,117-136,139-145,147-152,155,259-260
    //        src/modules/cli/checkUpdatesCommand.ts                                        |  100.00 |   95.33 | 121-122,143-145
    //        src/modules/cli/cleanupCommand.ts                                             |   71.43 |   79.87 | 186-195,208-227
    //        src/modules/cli/detectConflictsCommand.ts                                     |   80.00 |   80.73 | 158-178
    //        src/modules/cli/generateCommand.ts                                            |   62.50 |   75.89 | 100-108,110,114-115,119-122,130-139
    //        src/modules/cli/updateCommand.ts                                              |  100.00 |   94.02 | 119-120,194-196,198-199
    //        src/modules/config-loader/loadToolConfigs.ts                                  |    0.00 |    3.27 | 16-105,116-173
    //        src/modules/config-loader/toolConfigLoader.ts                                 |  100.00 |   97.83 | 134-135
    //        src/modules/config/toolConfigSchema.ts                                        |    0.00 |   82.49 | 181-188,250-272
    //        src/modules/file-system/MemFileSystem.ts                                      |   96.88 |   91.67 | 135-140
    //        src/modules/file-system/NodeFileSystem.ts                                     |   93.33 |   91.49 | 49-52
    //        src/modules/generator-shim/ShimGenerator.ts                                   |   83.33 |   68.31 | 174-218
    //        src/modules/tool-config-builder/toolConfigBuilder.ts                          |   90.91 |   98.58 | 147-148
    //        src/testing-helpers/bun-test-runner.ts                                        |   75.00 |   92.20 | 309-314,438-452,458-459
    //        src/testing-helpers/createMockFileSystem.ts                                   |   68.18 |   39.58 | 108-194
    //        src/types/platform.types.ts                                                   |   50.00 |   53.57 | 50-54,64-71
    //       -------------------------------------------------------------------------------|---------|---------|-------------------
    //        459 pass
    //       Ran 459 tests across 37 files. [1.59s]
    //       "
    //     `);
    //     done();
    //   });
    // });

});
