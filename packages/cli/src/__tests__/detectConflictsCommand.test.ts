import type { IConfigService, ProjectConfig } from '@dotfiles/config';
import { Architecture, Platform } from '@dotfiles/core';
import type { IMemFileSystemReturn } from '@dotfiles/file-system';
import type { GithubReleaseToolConfig } from '@dotfiles/installer-github';
import type { ManualToolConfig } from '@dotfiles/installer-manual';
import type { TestLogger } from '@dotfiles/logger';
import type { MockedInterface } from '@dotfiles/testing-helpers';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as path from 'node:path';
import { registerDetectConflictsCommand } from '../detectConflictsCommand';
import { messages } from '../log-messages';
import type { IGlobalProgram } from '../types';
import { createCliTestSetup } from './createCliTestSetup';

const createMockConfigService = (): MockedInterface<IConfigService> => ({
  loadSingleToolConfig: mock(async () => undefined),
  loadToolConfigs: mock(async () => ({})),
});

describe('detectConflictsCommand', () => {
  let program: IGlobalProgram;
  let mockProjectConfig: ProjectConfig;
  let logger: TestLogger;
  let mockFs: IMemFileSystemReturn;
  let mockConfigService: MockedInterface<IConfigService>;

  const toolAConfig: ManualToolConfig = {
    name: 'toolA',
    version: '1.0.0',
    binaries: ['toolA-bin'],
    symlinks: [{ source: 'toolA/.config', target: '.config/toolA' }],
    installationMethod: 'manual',
    installParams: { binaryPath: '/usr/local/bin/toolA-bin' },
  };

  const toolBConfig: GithubReleaseToolConfig = {
    name: 'toolB',
    version: '2.0.0',
    binaries: ['toolB-bin'],
    symlinks: [{ source: 'toolB/.settings', target: '.settings/toolB' }],
    installationMethod: 'github-release',
    installParams: { repo: 'user/toolB' },
  };

  beforeEach(async () => {
    const setup = await createCliTestSetup({
      testName: 'detect-conflicts-command',
    });

    program = setup.program;
    logger = setup.logger;
    mockFs = setup.mockFs;
    mockProjectConfig = setup.mockProjectConfig;

    mockConfigService = createMockConfigService();

    registerDetectConflictsCommand(logger, program, async () => ({
      ...setup.createServices(),
      configService: mockConfigService,
    }));
  });

  afterEach(() => {
    // Reset all mocks
    mockConfigService.loadToolConfigs.mockReset();
    mockConfigService.loadSingleToolConfig.mockReset();
  });

  test('should register detect-conflicts command', () => {
    const command = program.commands.find((cmd) => cmd.name() === 'detect-conflicts');
    expect(command).toBeDefined();
    expect(command?.description()).toBe(
      'Detects conflicts between potential generated artifacts and existing system files.',
    );
  });

  describe('Action Logic', () => {
    test('No tool configs found - should log info and exit 0', async () => {
      mockConfigService.loadToolConfigs.mockResolvedValue({});

      expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_0');

      expect(mockConfigService.loadToolConfigs).toHaveBeenCalledWith(
        expect.any(Object),
        mockProjectConfig.paths.toolConfigsDir,
        mockFs.fs.asIFileSystem,
        mockProjectConfig,
        expect.objectContaining({
          platform: Platform.Linux,
          arch: Architecture.X86_64,
          homeDir: mockProjectConfig.paths.homeDir,
        }),
      );
      logger.expect(
        ['INFO'],
        ['registerDetectConflictsCommand'],
        [],
        [messages.toolNoConfigurationsFound(mockProjectConfig.paths.toolConfigsDir)],
      );
    });

    test('Error during loadToolConfigs - should log error and exit 1', async () => {
      const loadError = new Error('Failed to load configs');
      mockConfigService.loadToolConfigs.mockRejectedValue(loadError);

      expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');

      logger.expect(
        ['ERROR'],
        ['registerDetectConflictsCommand'],
        [],
        [messages.configLoadFailed('tool configurations')],
      );
    });

    test('No conflicts found - should log info and exit 0', async () => {
      mockConfigService.loadToolConfigs.mockResolvedValue({ toolA: toolAConfig });
      // No files or symlinks added to the filesystem

      expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_0');

      logger.expect(['INFO'], ['registerDetectConflictsCommand'], [], [messages.noConflictsDetected()]);
    });

    test('Shim path conflict (not a generator shim) - should log warning and exit 1', async () => {
      mockConfigService.loadToolConfigs.mockResolvedValue({ toolA: toolAConfig });
      const shimPath = `${mockProjectConfig.paths.targetDir}/toolA-bin`;

      // Add a non-generator shim file
      await mockFs.addFiles({
        [shimPath]: 'some other content',
      });

      expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');

      const conflictsMessage = `  - [toolA]: ${shimPath} (exists but is not a generator shim)`;
      const expectedMessageShim = messages.toolConflictsDetected(
        'Conflicts detected with files not owned by the generator:',
        conflictsMessage,
      );
      logger.expect(['WARN'], ['registerDetectConflictsCommand'], [], [expectedMessageShim]);
    });

    test('Shim path exists and IS a generator shim - should NOT log warning for this shim', async () => {
      mockConfigService.loadToolConfigs.mockResolvedValue({ toolA: toolAConfig });
      const shimPath = `${mockProjectConfig.paths.targetDir}/toolA-bin`;

      // Add a generator shim file
      await mockFs.addFiles({
        [shimPath]: '#!/usr/bin/env bash\n# Generated by Dotfiles Management Tool\n# ...rest of shim...',
      });

      expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_0');
      logger.expect(['INFO'], ['registerDetectConflictsCommand'], [], [messages.noConflictsDetected()]);
    });

    test('Symlink target exists as a file - should log warning and exit 1', async () => {
      const toolASymlinks = toolAConfig.symlinks![0]!;
      const configPath = path.join(mockProjectConfig.paths.homeDir, toolASymlinks.target);
      const symlinkedConfigPath = path.join(mockProjectConfig.paths.dotfilesDir, toolASymlinks.source);

      mockConfigService.loadToolConfigs.mockResolvedValue({ toolA: toolAConfig });
      mockFs.addFiles({ [configPath]: 'some content' });
      mockFs.addSymlinks({ [symlinkedConfigPath]: configPath });
      expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');

      const conflictsMessage = `  - [toolA]: ${configPath} (exists but is not a symlink)`;
      const expectedMessageSymlinkFile = messages.toolConflictsDetected(
        'Conflicts detected with files not owned by the generator:',
        conflictsMessage,
      );
      logger.expect(['WARN'], ['registerDetectConflictsCommand'], [], [expectedMessageSymlinkFile]);
    });

    test('Symlink target exists as a symlink to a different source - should log warning and exit 1', async () => {
      mockConfigService.loadToolConfigs.mockResolvedValue({ toolA: toolAConfig });
      const toolASymlinks = toolAConfig.symlinks![0]!;
      const symlinkTargetPath = path.join(mockProjectConfig.paths.homeDir, toolASymlinks.target);
      const expectedSourcePath = path.join(mockProjectConfig.paths.dotfilesDir, toolASymlinks.source);
      const pointsToWrongAbsolutePath = '/some/other/absolute/path';

      // Create a symlink that points to the wrong location
      await mockFs.addSymlinks({
        [pointsToWrongAbsolutePath]: symlinkTargetPath,
      });

      expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');

      const conflictsMessage =
        `  - [toolA]: ${symlinkTargetPath} (points to '${pointsToWrongAbsolutePath}', expected '${expectedSourcePath}')`;
      const expectedMessage = messages.toolConflictsDetected(
        'Conflicts detected with files not owned by the generator:',
        conflictsMessage,
      );
      logger.expect(['WARN'], ['registerDetectConflictsCommand'], [], [expectedMessage]);
    });

    test('Multiple conflicts (shim and symlink) - should log all warnings and exit 1', async () => {
      mockConfigService.loadToolConfigs.mockResolvedValue({
        toolA: toolAConfig,
        toolB: toolBConfig,
      });

      const shimPathA = `${mockProjectConfig.paths.targetDir}/toolA-bin`;
      const toolBSymlinks = toolBConfig.symlinks![0]!;
      const symlinkPathB = path.join(mockProjectConfig.paths.homeDir, toolBSymlinks.target);

      // Add a non-generator shim file
      await mockFs.addFiles({
        [shimPathA]: 'some other content',
        // Add a regular file where a symlink should be
        [symlinkPathB]: 'regular file content',
      });

      expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');

      const conflictsMessage =
        `  - [toolA]: ${shimPathA} (exists but is not a generator shim)\n  - [toolB]: ${symlinkPathB} (exists but is not a symlink)`;
      const expectedMessageMultiple = messages.toolConflictsDetected(
        'Conflicts detected with files not owned by the generator:',
        conflictsMessage,
      );
      logger.expect(['WARN'], ['registerDetectConflictsCommand'], [], [expectedMessageMultiple]);
    });
  });
});
