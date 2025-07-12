import * as cliModule from '@cli';
import * as configLoaderModule from '@modules/config-loader';
import * as clientLoggerModule from '@modules/logger';
import * as generateCommandModule from '@modules/cli/generateCommand';
import { createMockClientLogger } from '@testing-helpers';
import { beforeEach, describe, expect, mock, spyOn, test, type Mock } from 'bun:test';
import type { ConsolaInstance } from 'consola';

// Spies and Mocks needed for these tests
let loggerMocks: ReturnType<typeof createMockClientLogger>['loggerMocks'];
let mockClientLogger: ConsolaInstance;
let createClientLoggerSpy: Mock<typeof clientLoggerModule.createClientLogger>;

describe('CLI Global Options --config', () => {
  beforeEach(() => {
    mock.restore();

    const { mockClientLogger: mcl, loggerMocks: lm } = createMockClientLogger();
    mockClientLogger = mcl;
    loggerMocks = lm;

    createClientLoggerSpy = spyOn(clientLoggerModule, 'createClientLogger').mockReturnValue(mockClientLogger);
    spyOn(configLoaderModule, 'loadToolConfigsFromDirectory').mockResolvedValue({});

    // Mock the registerGenerateCommand to prevent it from executing and exiting
    spyOn(generateCommandModule, 'registerGenerateCommand').mockImplementation((program) => {
      program
        .command('generate')
        .description('Mocked generate command')
        .action(() => {
          // Do nothing, just a stub
        });
    });

    // Since we are not testing the services themselves, we can mock setupServices
    // to return a minimal object.
    spyOn(cliModule, 'setupServices').mockResolvedValue({
      yamlConfig: { paths: { toolConfigsDir: '/fake/dir' } },
      fs: { constructor: { name: 'MockFS' } },
      generatorOrchestrator: { generateAll: mock(async () => ({})) },
    } as any);
  });

  test('--config option should be parsed and logged if provided', async () => {
    const testConfigPath = './my-test-config.yaml';
    const testArgv = ['node', 'cli.ts', '--config', testConfigPath, 'generate'];

    await cliModule.main(testArgv);

    // The hook logger and additional loggers from our changes
    expect(createClientLoggerSpy).toHaveBeenCalledTimes(3);

    // Check that the hook logger was called with the correct message
    expect(loggerMocks.info).toHaveBeenCalledWith(`Config file path: ${testConfigPath}`);
  });

  test('--config option should not log config path if not provided, and not error', async () => {
    const testArgv = ['node', 'cli.ts', 'generate']; // No --config

    await cliModule.main(testArgv);

    // Only the main command logger should be created
    expect(createClientLoggerSpy).toHaveBeenCalledTimes(1);

    const infoCalls = loggerMocks.info.mock.calls;
    const configLogFound = infoCalls.some(call => call[0]?.toString().startsWith('Config file path:'));
    expect(configLogFound).toBe(false);
  });
});
