import type { GlobalProgram } from '@cli';
import { type YamlConfig } from '@modules/config';
import {
  loadToolConfigsFromDirectory as actualLoadToolConfigsFromDirectory,
} from '@modules/config-loader';
import { ErrorTemplates, WarningTemplates } from '@modules/shared/ErrorTemplates';
import { clearMockRegistry, createModuleMocker, setupTestCleanup } from '@rageltd/bun-test-utils';
import { TestLogger, type MemFileSystemReturn } from '@testing-helpers';
import { createCliTestSetup } from './createCliTestSetup';
import type { GithubReleaseToolConfig, ManualToolConfig } from '@types';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as path from 'node:path';
import { registerDetectConflictsCommand } from '../detectConflictsCommand';

setupTestCleanup();
const mockModules = createModuleMocker();

const createMockLoadToolConfigsFromDirectory = () => mock(actualLoadToolConfigsFromDirectory);
let mockLoadToolConfigsFromDirectory: ReturnType<typeof createMockLoadToolConfigsFromDirectory>;

describe('detectConflictsCommand', () => {
  let program: GlobalProgram;
  let mockYamlConfig: YamlConfig;
  let logger: TestLogger;
  let mockFs: MemFileSystemReturn;

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
    mock.restore();
    clearMockRegistry();

    const setup = await createCliTestSetup({
      testName: 'detect-conflicts-command',
    });

    program = setup.program;
    logger = setup.logger;
    mockFs = setup.mockFs;
    mockYamlConfig = setup.mockYamlConfig;

    mockLoadToolConfigsFromDirectory = createMockLoadToolConfigsFromDirectory();

    await mockModules.mock('@modules/config-loader', () => ({
      loadToolConfigsFromDirectory: mockLoadToolConfigsFromDirectory,
      loadSingleToolConfig: mock(async () => ({})),
    }));

    registerDetectConflictsCommand(logger, program, async () => setup.createServices());
  });

  afterEach(() => {
    clearMockRegistry();
  });

  afterAll(() => {
    mockModules.restoreAll();
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
      mockLoadToolConfigsFromDirectory.mockResolvedValue({});

      expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow(
        'MOCK_EXIT_CLI_CALLED_WITH_0',
      );

      expect(mockLoadToolConfigsFromDirectory).toHaveBeenCalledWith(
        expect.any(Object),
        mockYamlConfig.paths.toolConfigsDir,
        mockFs.fs.asIFileSystem,
      );
      logger.expect(
        ['INFO'],
        ['registerDetectConflictsCommand', 'detectConflictsActionLogic'],
        [/No tool configurations found in .*\/configs\/tools/],
      );
    });

    test('Error during loadToolConfigsFromDirectory - should log error and exit 1', async () => {
      const loadError = new Error('Failed to load configs');
      mockLoadToolConfigsFromDirectory.mockRejectedValue(loadError);

      expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow(
        'MOCK_EXIT_CLI_CALLED_WITH_1',
      );

      logger.expect(
        ['ERROR'],
        ['registerDetectConflictsCommand', 'detectConflictsActionLogic'],
        [ErrorTemplates.config.loadFailed('tool configurations', loadError.message)],
      );
    });

    test('No conflicts found - should log info and exit 0', async () => {
      mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig });
      // No files or symlinks added to the filesystem

      expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow(
        'MOCK_EXIT_CLI_CALLED_WITH_0',
      );

      logger.expect(
        ['INFO'],
        ['registerDetectConflictsCommand', 'detectConflictsActionLogic'],
        ['No conflicts detected'],
      );
    });

    test('Shim path conflict (not a generator shim) - should log warning and exit 1', async () => {
      mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig });
      const shimPath = `${mockYamlConfig.paths.targetDir}/toolA-bin`;

      // Add a non-generator shim file
      await mockFs.addFiles({
        [shimPath]: 'some other content',
      });

      expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow(
        'MOCK_EXIT_CLI_CALLED_WITH_1',
      );

      const conflictsMessage = `  - [toolA]: ${shimPath} (exists but is not a generator shim)`;
      const expectedMessageShim = WarningTemplates.tool.conflictsDetected('Conflicts detected with files not owned by the generator:', conflictsMessage);
      logger.expect(
        ['WARN'],
        ['registerDetectConflictsCommand', 'detectConflictsActionLogic'],
        [expectedMessageShim],
      );
    });

    test('Shim path exists and IS a generator shim - should NOT log warning for this shim', async () => {
      mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig });
      const shimPath = `${mockYamlConfig.paths.targetDir}/toolA-bin`;

      // Add a generator shim file
      await mockFs.addFiles({
        [shimPath]:
          '#!/usr/bin/env bash\n# Generated by Dotfiles Management Tool\n# ...rest of shim...',
      });

      expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow(
        'MOCK_EXIT_CLI_CALLED_WITH_0',
      );
      logger.expect(
        ['INFO'],
        ['registerDetectConflictsCommand', 'detectConflictsActionLogic'],
        ['No conflicts detected'],
      );
    });

    test('Symlink target exists as a file - should log warning and exit 1', async () => {
      const toolASymlinks = toolAConfig.symlinks![0]!;
      const configPath = path.join(mockYamlConfig.paths.homeDir, toolASymlinks.target);
      const symlinkedConfigPath = path.join(
        mockYamlConfig.paths.dotfilesDir,
        toolASymlinks.source,
      );

      mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig });
      mockFs.addFiles({ [configPath]: 'some content' });
      mockFs.addSymlinks({ [symlinkedConfigPath]: configPath });
      expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow(
        'MOCK_EXIT_CLI_CALLED_WITH_1',
      );

      const conflictsMessage = `  - [toolA]: ${configPath} (exists but is not a symlink)`;
      const expectedMessageSymlinkFile = WarningTemplates.tool.conflictsDetected('Conflicts detected with files not owned by the generator:', conflictsMessage);
      logger.expect(
        ['WARN'],
        ['registerDetectConflictsCommand', 'detectConflictsActionLogic'],
        [expectedMessageSymlinkFile],
      );
    });

    test('Symlink target exists as a symlink to a different source - should log warning and exit 1', async () => {
      mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig });
      const toolASymlinks = toolAConfig.symlinks![0]!;
      const symlinkTargetPath = path.join(mockYamlConfig.paths.homeDir, toolASymlinks.target);
      const expectedSourcePath = path.join(mockYamlConfig.paths.dotfilesDir, toolASymlinks.source);
      const pointsToWrongAbsolutePath = '/some/other/absolute/path';

      // Create a symlink that points to the wrong location
      await mockFs.addSymlinks({
        [pointsToWrongAbsolutePath]: symlinkTargetPath,
      });

      expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow(
        'MOCK_EXIT_CLI_CALLED_WITH_1',
      );

      const conflictsMessage = `  - [toolA]: ${symlinkTargetPath} (points to '${pointsToWrongAbsolutePath}', expected '${expectedSourcePath}')`;
      const expectedMessage = WarningTemplates.tool.conflictsDetected('Conflicts detected with files not owned by the generator:', conflictsMessage);
      logger.expect(
        ['WARN'],
        ['registerDetectConflictsCommand', 'detectConflictsActionLogic'],
        [expectedMessage],
      );
    });

    test('Multiple conflicts (shim and symlink) - should log all warnings and exit 1', async () => {
      mockLoadToolConfigsFromDirectory.mockResolvedValue({
        toolA: toolAConfig,
        toolB: toolBConfig,
      });

      const shimPathA = `${mockYamlConfig.paths.targetDir}/toolA-bin`;
      const toolBSymlinks = toolBConfig.symlinks![0]!;
      const symlinkPathB = path.join(mockYamlConfig.paths.homeDir, toolBSymlinks.target);

      // Add a non-generator shim file
      await mockFs.addFiles({
        [shimPathA]: 'some other content',
        // Add a regular file where a symlink should be
        [symlinkPathB]: 'regular file content',
      });

      expect(program.parseAsync(['detect-conflicts'], { from: 'user' })).rejects.toThrow(
        'MOCK_EXIT_CLI_CALLED_WITH_1',
      );

      const conflictsMessage = `  - [toolA]: ${shimPathA} (exists but is not a generator shim)\n  - [toolB]: ${symlinkPathB} (exists but is not a symlink)`;
      const expectedMessageMultiple = WarningTemplates.tool.conflictsDetected('Conflicts detected with files not owned by the generator:', conflictsMessage);
      logger.expect(
        ['WARN'],
        ['registerDetectConflictsCommand', 'detectConflictsActionLogic'],
        [expectedMessageMultiple],
      );
    });
  });
});
