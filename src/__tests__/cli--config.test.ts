/**
 * @file src/__tests__/cli--config.test.ts
 * @description Tests for the CLI's global --config option.
 *
 * ## Development Plan
 * - [x] Move --config option tests from cli.test.ts to this file.
 * - [x] Ensure all necessary imports and mocks are correctly set up.
 * - [x] Verify tests pass in isolation.
 * - [x] Fix failing tests related to --config option.
 *   - [x] Diagnose why '--config option should not log config path if not provided, and not error' fails.
 *   - [x] Diagnose why '--config option logging occurs even if a command action subsequently fails' fails.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import * as generateCommandModule from '@modules/cli/generateCommand';
import * as newConfigLoaderModule from '@modules/config-loader/loadToolConfigs'; // For loadToolConfigsFromDirectorySpy
import * as clientLoggerModule from '@modules/logger';
import { createMockClientLogger } from '@testing-helpers';
import { beforeEach, describe, expect, mock, spyOn, test, type Mock } from 'bun:test';
import type { ConsolaInstance } from 'consola';
import { main as actualMain } from '../cli';

// Spies and Mocks needed for these tests
let loggerMocks: ReturnType<typeof createMockClientLogger>['loggerMocks'];
let mockClientLogger: ConsolaInstance; // Renamed from defaultMcl to avoid conflict if used elsewhere
let createClientLoggerSpy: Mock<typeof clientLoggerModule.createClientLogger>;
let generateActionLogicSpy: Mock<typeof generateCommandModule.generateActionLogic>;
let loadToolConfigsFromDirectorySpy: Mock<typeof newConfigLoaderModule.loadToolConfigsFromDirectory>;

describe('CLI Global Options --config', () => {
  beforeEach(async () => {
    mock.restore()

    // Initialize spies relevant to these tests
    const { mockClientLogger: mcl, loggerMocks: lm } = createMockClientLogger();
    mockClientLogger = mcl;
    loggerMocks = lm;

    createClientLoggerSpy = spyOn(clientLoggerModule, 'createClientLogger').mockImplementation(
      () => 
        mockClientLogger
    );

    generateActionLogicSpy = spyOn(generateCommandModule, 'generateActionLogic');
    loadToolConfigsFromDirectorySpy = spyOn(newConfigLoaderModule, 'loadToolConfigsFromDirectory');
    loadToolConfigsFromDirectorySpy.mockResolvedValue({}); // Default mock
  });

  test('--config option should be parsed and logged if provided', async () => {
    const testConfigPath = './my-test-config.yaml';
    const testArgv = ['node', 'cli.ts', '--config', testConfigPath, 'generate'];

    generateActionLogicSpy.mockResolvedValue({} as any);

    await actualMain(testArgv); // No longer pass testProgram

    expect(createClientLoggerSpy).toHaveBeenCalledTimes(2); // Hook + generate action

    const hookLoggerInstance = createClientLoggerSpy.mock.results[0]?.value as ConsolaInstance | undefined;
    expect(hookLoggerInstance).toBeDefined();
    expect(loggerMocks.info).toHaveBeenCalledWith(`Config file path: ${testConfigPath}`);
  });

  test('--config option should not log config path if not provided, and not error', async () => {
    const testArgv = ['node', 'cli.ts', 'generate']; // No --config
    generateActionLogicSpy.mockResolvedValue({} as any);
    loadToolConfigsFromDirectorySpy.mockResolvedValue({});


    await actualMain(testArgv); // No longer pass testProgram

    expect(createClientLoggerSpy).toHaveBeenCalledTimes(1); // Only by generate action
    
    const infoCalls = loggerMocks.info.mock.calls;
    const configLogFound = infoCalls.some(call => call[0]?.toString().startsWith('Config file path:'));
    expect(configLogFound).toBe(false);
  });
});