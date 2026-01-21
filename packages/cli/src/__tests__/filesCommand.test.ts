import type { IConfigService, ProjectConfig } from '@dotfiles/config';
import type { ToolConfig } from '@dotfiles/core';
import type { TestLogger } from '@dotfiles/logger';
import type { MockedInterface } from '@dotfiles/testing-helpers';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import path from 'node:path';
import { registerFilesCommand } from '../filesCommand';
import { messages } from '../log-messages';
import type { IGlobalProgram, IServices } from '../types';
import { createCliTestSetup } from './createCliTestSetup';

const createMockConfigService = (): MockedInterface<IConfigService> => ({
  loadSingleToolConfig: mock(async () => undefined),
  loadToolConfigs: mock(async () => ({})),
  loadToolConfigByBinary: mock(async () => undefined),
});

describe('filesCommand', () => {
  let program: IGlobalProgram;
  let testLogger: TestLogger;
  let mockProjectConfig: ProjectConfig;
  let mockServices: IServices;
  let mockConfigService: MockedInterface<IConfigService>;
  let printedOutput: string[];
  let mockPrint: (message: string) => void;

  const toolConfig: ToolConfig = {
    name: 'test-tool',
    version: '1.0.0',
    installationMethod: 'manual',
    installParams: { binaryPath: '/usr/local/bin/test-tool' },
    binaries: ['test-tool'],
  };

  beforeEach(async () => {
    const setup = await createCliTestSetup({
      testName: 'files-command',
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
      mockPrint,
    );
  });

  afterEach(() => {
    mockConfigService.loadSingleToolConfig.mockReset();
    mockConfigService.loadToolConfigs.mockReset();
  });

  test('should register files command successfully', () => {
    const commands = program.commands;
    const filesCommand = commands.find((cmd) => cmd.name() === 'files');

    expect(filesCommand).toBeDefined();
    expect(filesCommand?.description()).toContain('tree');
  });

  test('should display tree of files for existing tool', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(toolConfig);

    const toolDir: string = path.join(mockProjectConfig.paths.binariesDir, 'test-tool', '1.0.0');

    // Mock toolInstallationRegistry to return installation record
    const mockGetToolInstallation = mockServices.toolInstallationRegistry.getToolInstallation as ReturnType<
      typeof mock
    >;
    mockGetToolInstallation.mockResolvedValue({
      id: 1,
      toolName: 'test-tool',
      version: '1.0.0',
      installPath: toolDir,
      timestamp: new Date().toISOString(),
      binaryPaths: [path.join(toolDir, 'binary1')],
      installedAt: new Date(),
    });

    // Create a sample directory structure
    await mockServices.fs.mkdir(toolDir, { recursive: true });
    await mockServices.fs.writeFile(path.join(toolDir, 'binary1'), 'content1');
    await mockServices.fs.writeFile(path.join(toolDir, 'binary2'), 'content2');
    const subDir: string = path.join(toolDir, 'subdir');
    await mockServices.fs.mkdir(subDir, { recursive: true });
    await mockServices.fs.writeFile(path.join(subDir, 'file.txt'), 'nested');

    await program.parseAsync(['files', 'test-tool'], { from: 'user' });

    // Should display the path and tree
    expect(printedOutput.length).toBeGreaterThan(0);
    expect(printedOutput[0]).toBe(toolDir);
    const treeOutput: string = printedOutput.slice(1).join('\n');
    expect(treeOutput).toContain('binary1');
    expect(treeOutput).toContain('binary2');
    expect(treeOutput).toContain('subdir');
    expect(treeOutput).toContain('file.txt');
  });

  test('should exit with error if tool has no installed version', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(undefined);

    expect(program.parseAsync(['files', 'nonexistent'], { from: 'user' })).rejects.toThrow(
      'MOCK_EXIT_CLI_CALLED_WITH_1',
    );

    testLogger.expect(
      ['ERROR'],
      ['registerFilesCommand'],
      [],
      [messages.toolNotFound('nonexistent', mockProjectConfig.paths.toolConfigsDir)],
    );
  });

  test('should display tree of files for existing tool', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(toolConfig);

    const mockGetToolInstallation = mockServices.toolInstallationRegistry.getToolInstallation as ReturnType<
      typeof mock
    >;
    mockGetToolInstallation.mockResolvedValue(null);

    expect(program.parseAsync(['files', 'test-tool'], { from: 'user' })).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');

    // Should log error about no installed version
    testLogger.expect(['ERROR'], ['registerFilesCommand'], [], [/not installed/i]);
  });

  test('should handle empty directory', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(toolConfig);

    const toolDir: string = path.join(mockProjectConfig.paths.binariesDir, 'test-tool', '1.0.0');

    const mockGetToolInstallation = mockServices.toolInstallationRegistry.getToolInstallation as ReturnType<
      typeof mock
    >;
    mockGetToolInstallation.mockResolvedValue({
      id: 1,
      toolName: 'test-tool',
      version: '1.0.0',
      installPath: toolDir,
      timestamp: new Date().toISOString(),
      binaryPaths: [],
      installedAt: new Date(),
    });

    await mockServices.fs.mkdir(toolDir, { recursive: true });

    await program.parseAsync(['files', 'test-tool'], { from: 'user' });

    expect(printedOutput).toEqual([toolDir, '(empty directory)']);
  });
});
