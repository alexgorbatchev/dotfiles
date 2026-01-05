/**
 * Integration tests for logger context propagation in the files command.
 *
 * Verifies that tool name context flows through log messages when displaying files.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { IConfigService, ProjectConfig } from '@dotfiles/config';
import type { ToolConfig } from '@dotfiles/core';
import type { TestLogger } from '@dotfiles/logger';
import type { MockedInterface } from '@dotfiles/testing-helpers';
import { registerFilesCommand } from '../filesCommand';
import { messages } from '../log-messages';
import type { IGlobalProgram, IServices } from '../types';
import { createCliTestSetup } from './createCliTestSetup';

const createMockConfigService = (): MockedInterface<IConfigService> => ({
  loadSingleToolConfig: mock(async () => undefined),
  loadToolConfigs: mock(async () => ({})),
});

describe('filesCommand - Logger Context Propagation', () => {
  let program: IGlobalProgram;
  let testLogger: TestLogger;
  let mockProjectConfig: ProjectConfig;
  let mockServices: IServices;
  let mockConfigService: MockedInterface<IConfigService>;
  let printedOutput: string[];
  let mockPrint: (message: string) => void;

  const TOOL_NAME = 'test-tool';

  const toolConfig: ToolConfig = {
    name: TOOL_NAME,
    version: '1.0.0',
    installationMethod: 'manual',
    installParams: { binaryPath: '/usr/local/bin/test-tool' },
    binaries: ['test-tool'],
  };

  beforeEach(async () => {
    const setup = await createCliTestSetup({
      testName: 'files-context',
      services: {
        toolInstallationRegistry: true,
      },
    });

    program = setup.program;
    testLogger = setup.logger;
    mockProjectConfig = setup.mockProjectConfig;
    mockServices = setup.createServices();
    mockConfigService = createMockConfigService();
    printedOutput = [];
    mockPrint = (message: string) => {
      printedOutput.push(message);
    };

    registerFilesCommand(
      testLogger,
      program,
      async () => ({
        ...mockServices,
        configService: mockConfigService,
      }),
      mockPrint
    );
  });

  afterEach(() => {
    mockConfigService.loadSingleToolConfig.mockReset();
    mockConfigService.loadToolConfigs.mockReset();
  });

  test('should include tool name in error message when tool not found', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(undefined);

    expect(program.parseAsync(['files', TOOL_NAME], { from: 'user' })).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');

    // No context - tool doesn't exist, so nothing to set context for
    testLogger.expect(
      ['ERROR'],
      ['registerFilesCommand'],
      [],
      [messages.toolNotFound(TOOL_NAME, mockProjectConfig.paths.toolConfigsDir)]
    );
  });

  test('should include tool name in error message when tool not installed', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(toolConfig);

    const mockGetToolInstallation = mockServices.toolInstallationRegistry.getToolInstallation as ReturnType<
      typeof mock
    >;
    mockGetToolInstallation.mockResolvedValue(null);

    expect(program.parseAsync(['files', TOOL_NAME], { from: 'user' })).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');

    // No context - tool exists in config but not installed, so not operational
    testLogger.expect(['ERROR'], ['registerFilesCommand'], [], [messages.toolNotInstalled(TOOL_NAME)]);
  });
});
