import { exitCli } from '@modules/cli/exitCli';
import type { AppConfig } from '@modules/config';
import * as configLoader from '@modules/config-loader/loadToolConfigs';
import type { IFileSystem } from '@modules/file-system';
import type { IGeneratorOrchestrator } from '@modules/generator-orchestrator'; 
import { createMockAppConfig, createMockClientLogger, createMockFileSystem, type MockClientLogger, type MockFileSystem } from '@testing-helpers';
import type { GeneratedArtifactsManifest, GithubReleaseToolConfig, ManualToolConfig } from '@types'; 
import { beforeEach, describe, expect, mock, test } from 'bun:test'; 
import { Command } from 'commander';
import path from 'node:path'; 
import { detectConflictsActionLogic, registerDetectConflictsCommand } from '../detectConflictsCommand';

import type { ConsolaInstance } from 'consola'; // Import ConsolaInstance

// Mock exitCli
mock.module('@modules/cli/exitCli', () => ({ // Use mock.module
  exitCli: mock((code: number) => { // Use mock()
    throw new Error(`MOCK_EXIT_CLI_CALLED_WITH_${code}`);
  }),
}));

// Mock loadToolConfigsFromDirectory
const mockLoadToolConfigsFromDirectory = mock((..._args: any[]) => Promise.resolve({})); // Use mock() and give a default implementation
mock.module('@modules/config-loader/loadToolConfigs', () => ({ // Use mock.module
  loadToolConfigsFromDirectory: (...args: any[]) => mockLoadToolConfigsFromDirectory(...args),
}));


describe('detectConflictsCommand', () => {
  let program: Command;
  let mockAppConfig: AppConfig;
  let fileSystemMocks: MockFileSystem; // Correctly named for the collection of mocks
  let loggerMocks: MockClientLogger; // Correctly named for the collection of mocks
  let services: {
    appConfig: AppConfig;
    fileSystem: IFileSystem;
    clientLogger: ConsolaInstance; // Expecting ConsolaInstance for the service
    loadToolConfigsFromDirectory: typeof configLoader.loadToolConfigsFromDirectory;
    generatorOrchestrator: IGeneratorOrchestrator; // Added
  };
  let mockGeneratorOrchestrator: IGeneratorOrchestrator; // Added

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


  beforeEach(() => {
    // Reset individual mocks if they were spied on or had specific implementations per test
    // For mocks created with `mock()`, often they are fresh or reset by default.
    // If `mockLoadToolConfigsFromDirectory` needs resetting:
    mockLoadToolConfigsFromDirectory.mockClear(); // or .mockReset() if restoring original impl is needed
    // If exitCli's mock (created via mock.module) needs its call count reset,
    // you might need to re-assign it or handle it if Bun's mock.module doesn't auto-clear calls.
    // For now, assuming Bun's test runner handles mock state well between tests or rely on specific mock.clear()
    // No direct equivalent for a global vi.clearAllMocks() when using imported mocks.

    program = new Command();
    mockAppConfig = createMockAppConfig({
      homeDir: '/Users/testuser',
      dotfilesDir: '/Users/testuser/.dotfiles',
      targetDir: '/Users/testuser/.local/bin', // Shim directory
      toolConfigsDir: '/Users/testuser/.dotfiles/generator/tool-configs',
    });

    const fsHelperReturn = createMockFileSystem();
    const loggerHelperReturn = createMockClientLogger();

    // Assign to the correctly declared variables at the describe scope
    fileSystemMocks = fsHelperReturn.fileSystemMocks;
    loggerMocks = loggerHelperReturn.loggerMocks;

    mockGeneratorOrchestrator = { // Added
      generateAll: mock(async (): Promise<GeneratedArtifactsManifest> => ({
        lastGenerated: '',
        shims: [],
        shellInit: { path: null },
        symlinks: [],
        generatorVersion: 'mocked',
      })),
    };

    registerDetectConflictsCommand(
      program
    );

    services = {
      appConfig: mockAppConfig,
      fileSystem: fsHelperReturn.mockFileSystem,
      clientLogger: loggerHelperReturn.mockClientLogger,
      loadToolConfigsFromDirectory: mockLoadToolConfigsFromDirectory,
      generatorOrchestrator: mockGeneratorOrchestrator, // Added
    };
  });

  test('should register detect-conflicts command', () => {
    const command = program.commands.find(cmd => cmd.name() === 'detect-conflicts');
    expect(command).toBeDefined();
    expect(command?.description()).toBe('Detects conflicts between potential generated artifacts and existing system files.');
  });

  describe('detectConflictsActionLogic', () => {
    test('No tool configs found - should log info and exit 0', async () => {
      mockLoadToolConfigsFromDirectory.mockResolvedValue({});

      await expect(detectConflictsActionLogic({}, services)).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_0');

      expect(mockLoadToolConfigsFromDirectory).toHaveBeenCalledWith(mockAppConfig.toolConfigsDir, services.fileSystem);
      expect(loggerMocks.info).toHaveBeenCalledWith('No tool configurations found. Nothing to check for conflicts.');
      expect(exitCli).toHaveBeenCalledWith(0);
    });

    test('Error during loadToolConfigsFromDirectory - should log error and exit 1', async () => {
      const loadError = new Error('Failed to load configs');
      mockLoadToolConfigsFromDirectory.mockRejectedValue(loadError);

      await expect(detectConflictsActionLogic({}, services)).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');

      expect(loggerMocks.error).toHaveBeenCalledWith(`Error loading tool configurations: ${loadError.message}`);
      expect(exitCli).toHaveBeenCalledWith(1);
    });

    test('No conflicts found - should log info and exit 0', async () => {
      mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig });
      fileSystemMocks.exists.mockResolvedValue(false); // No shims exist
      fileSystemMocks.stat.mockImplementation(async (_path: string) => { // Add type for path, prefixed with _
        throw { code: 'ENOENT' };
      });


      await expect(detectConflictsActionLogic({}, services)).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_0');

      expect(loggerMocks.info).toHaveBeenCalledWith('No conflicts detected.');
      expect(exitCli).toHaveBeenCalledWith(0);
    });

    test('Shim path conflict (not a generator shim) - should log warning and exit 1', async () => {
      mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig });
      const shimPath = `${mockAppConfig.targetDir}/toolA-bin`;
      fileSystemMocks.exists.mockImplementation(async (p: string) => p === shimPath);
      fileSystemMocks.readFile.mockImplementation(async (p: string) => {
        if (p === shimPath) return "some other content";
        throw new Error("File not found in mock");
      });
      fileSystemMocks.lstat.mockImplementation(async (_path: string) => { // Use lstat
        throw { code: 'ENOENT' };
      });

      await expect(detectConflictsActionLogic({}, services)).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');

      const expectedMessageShim = `Conflicts detected with files not owned by the generator:\n  - [toolA]: ${shimPath} (exists but is not a generator shim)`;
      expect(loggerMocks.warn).toHaveBeenCalledWith(expectedMessageShim);
      expect(exitCli).toHaveBeenCalledWith(1);
    });

    test('Shim path exists and IS a generator shim - should NOT log warning for this shim', async () => {
      mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig });
      const shimPath = `${mockAppConfig.targetDir}/toolA-bin`;
      fileSystemMocks.exists.mockImplementation(async (p: string) => p === shimPath);
      fileSystemMocks.readFile.mockImplementation(async (p: string) => {
        if (p === shimPath) return "#!/usr/bin/env bash\n# Generated by Dotfiles Management Tool\n# ...rest of shim...";
        throw new Error("File not found in mock");
      });
      // Ensure no other conflicts (e.g., symlinks)
      fileSystemMocks.lstat.mockImplementation(async (_path: string) => { // Use lstat
        throw { code: 'ENOENT' };
      });

      await expect(detectConflictsActionLogic({}, services)).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_0');
      expect(loggerMocks.info).toHaveBeenCalledWith('No conflicts detected.');
      expect(loggerMocks.warn).not.toHaveBeenCalled(); // No warnings at all
      expect(exitCli).toHaveBeenCalledWith(0);
    });

    test('Shim path conflict (cannot read shim file) - should log warning and exit 1', async () => {
      mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig });
      const shimPath = `${mockAppConfig.targetDir}/toolA-bin`;
      const readError = new Error("Permission denied");
      fileSystemMocks.exists.mockImplementation(async (p: string) => p === shimPath);
      fileSystemMocks.readFile.mockImplementation(async (p: string) => {
        if (p === shimPath) throw readError;
        throw new Error("File not found in mock for other paths");
      });
      fileSystemMocks.lstat.mockImplementation(async (_path: string) => { // Use lstat
        throw { code: 'ENOENT' };
      });

      await expect(detectConflictsActionLogic({}, services)).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');

      // Check for the specific warning about not being able to read
      expect(loggerMocks.warn).toHaveBeenCalledWith(`Could not read potential shim at '${shimPath}' for tool 'toolA': ${readError.message}`);
      // Check for the consolidated conflict message
      const expectedMessageShimUnreadable = `Conflicts detected with files not owned by the generator:\n  - [toolA]: ${shimPath} (exists but could not be read/verified)`;
      expect(loggerMocks.warn).toHaveBeenCalledWith(expectedMessageShimUnreadable);
      expect(exitCli).toHaveBeenCalledWith(1);
    });

    test('Symlink target exists as a file - should log warning and exit 1', async () => {
      mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig });
      const symlinkTargetPath = `${mockAppConfig.homeDir}/.config/toolA`;
      fileSystemMocks.exists.mockResolvedValue(false); // No shim conflict
      fileSystemMocks.lstat.mockImplementation(async (p: string) => { // Use lstat
        if (p === symlinkTargetPath) {
          return { isSymbolicLink: () => false, isFile: () => true, isDirectory: () => false } as any;
        }
        throw { code: 'ENOENT' };
      });

      await expect(detectConflictsActionLogic({}, services)).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');

      const expectedMessageSymlinkFile = `Conflicts detected with files not owned by the generator:\n  - [toolA]: ${symlinkTargetPath} (exists but is not a symlink)`;
      expect(loggerMocks.warn).toHaveBeenCalledWith(expectedMessageSymlinkFile);
      expect(exitCli).toHaveBeenCalledWith(1);
    });

    test('Symlink target exists as a symlink to a different source - should log warning and exit 1', async () => {
      mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig });
      const symlinkTargetPath = `${mockAppConfig.homeDir}/.config/toolA`;
      const expectedSourcePath = `${mockAppConfig.dotfilesDir}/toolA/.config`;
      const pointsToWrongAbsolutePath = '/some/other/absolute/path';
      const pointsToWrongRelativePath = '../wrong-relative-path'; // Relative from dirname(symlinkTargetPath)

      fileSystemMocks.exists.mockResolvedValue(false);
      fileSystemMocks.lstat.mockImplementation(async (p: string) => { // Use lstat
        if (p === symlinkTargetPath) return { isSymbolicLink: () => true } as any;
        throw { code: 'ENOENT' };
      });

      // Test with absolute wrong path
      fileSystemMocks.readlink.mockResolvedValue(pointsToWrongAbsolutePath);
      await expect(detectConflictsActionLogic({}, services)).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');
      let expectedMessage = `Conflicts detected with files not owned by the generator:\n  - [toolA]: ${symlinkTargetPath} (points to '${pointsToWrongAbsolutePath}', expected '${expectedSourcePath}')`;
      expect(loggerMocks.warn).toHaveBeenCalledWith(expectedMessage);

      // Test with relative wrong path
      loggerMocks.warn.mockClear(); // Clear previous call
      // Ensure exitCli mock is reset or we check for multiple calls if that's the desired behavior.
      // For simplicity, let's assume exitCli is called once per logical failure scenario.
      // If exitCli is only checked at the end, this mockClear for loggerMocks.warn is fine.
      (exitCli as any).mockClear(); // Reset exitCli mock for the next assertion in this test

      fileSystemMocks.readlink.mockResolvedValue(pointsToWrongRelativePath);
      await expect(detectConflictsActionLogic({}, services)).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');
      expectedMessage = `Conflicts detected with files not owned by the generator:\n  - [toolA]: ${symlinkTargetPath} (points to '${pointsToWrongRelativePath}', expected '${expectedSourcePath}')`;
      expect(loggerMocks.warn).toHaveBeenCalledWith(expectedMessage);

      expect(exitCli).toHaveBeenCalledWith(1);
    });

     test('Symlink target exists as a symlink to the correct source (absolute link) - should NOT log warning', async () => {
      mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig });
      const symlinkTargetPath = `${mockAppConfig.homeDir}/.config/toolA`;
      const expectedSourcePath = `${mockAppConfig.dotfilesDir}/toolA/.config`;

      fileSystemMocks.exists.mockResolvedValue(false);
      fileSystemMocks.lstat.mockImplementation(async (p: string) => { // Use lstat
        if (p === symlinkTargetPath) return { isSymbolicLink: () => true } as any;
        throw { code: 'ENOENT' };
      });
      fileSystemMocks.readlink.mockResolvedValue(expectedSourcePath); // Points to correct absolute source

      await expect(detectConflictsActionLogic({}, services)).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_0');
      expect(loggerMocks.info).toHaveBeenCalledWith('No conflicts detected.');
      expect(loggerMocks.warn).not.toHaveBeenCalled();
      expect(exitCli).toHaveBeenCalledWith(0);
    });

    test('Symlink target exists as a symlink to the correct source (relative link) - should NOT log warning', async () => {
      mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig });
      const symlinkTargetPath = `${mockAppConfig.homeDir}/.config/toolA`;
      const expectedSourcePath = `${mockAppConfig.dotfilesDir}/toolA/.config`;
      const correctRelativeLink = path.relative(path.dirname(symlinkTargetPath), expectedSourcePath);

      fileSystemMocks.exists.mockResolvedValue(false);
      fileSystemMocks.lstat.mockImplementation(async (p: string) => { // Use lstat
        if (p === symlinkTargetPath) return { isSymbolicLink: () => true } as any;
        throw { code: 'ENOENT' };
      });
      fileSystemMocks.readlink.mockResolvedValue(correctRelativeLink);

      await expect(detectConflictsActionLogic({}, services)).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_0');
      expect(loggerMocks.info).toHaveBeenCalledWith('No conflicts detected.');
      expect(loggerMocks.warn).not.toHaveBeenCalled();
      expect(exitCli).toHaveBeenCalledWith(0);
    });

    test('Multiple conflicts (shim and symlink) - should log all warnings and exit 1', async () => {
      mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig, toolB: toolBConfig });

      const shimPathA = `${mockAppConfig.targetDir}/toolA-bin`;
      const symlinkPathB = `${mockAppConfig.homeDir}/.settings/toolB`;
      // const expectedSourcePathB = `${mockAppConfig.dotfilesDir}/toolB/.settings`; // Not needed for this specific assertion

      fileSystemMocks.exists.mockImplementation(async (p: string) => p === shimPathA); // Add type for p
      fileSystemMocks.lstat.mockImplementation(async (p: string) => { // Use lstat
        if (p === symlinkPathB) { // toolB symlink target exists as a file
          return { isSymbolicLink: () => false } as any;
        }
        throw { code: 'ENOENT' }; // Other symlinks or toolA symlink don't exist
      });


      // For this multiple conflict test, assume toolA's shim is a non-generator shim
      fileSystemMocks.readFile.mockImplementation(async (p: string) => {
        if (p === shimPathA) return "some other content";
        throw new Error("File not found in mock for other paths");
      });

      await expect(detectConflictsActionLogic({}, services)).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');

      const expectedMessageMultiple = `Conflicts detected with files not owned by the generator:\n  - [toolA]: ${shimPathA} (exists but is not a generator shim)\n  - [toolB]: ${symlinkPathB} (exists but is not a symlink)`;
      expect(loggerMocks.warn).toHaveBeenCalledWith(expectedMessageMultiple);
      expect(exitCli).toHaveBeenCalledWith(1);
    });

    test('lstat error (not ENOENT) for symlink check - should log warning but continue', async () => {
        mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig });
        const symlinkTargetPath = `${mockAppConfig.homeDir}/.config/toolA`;
        const statError = new Error("Permissions error");
        (statError as any).code = 'EACCES';

        fileSystemMocks.exists.mockResolvedValue(false); // No shim conflict
        fileSystemMocks.lstat.mockImplementation(async (p: string) => { // Use lstat
            if (p === symlinkTargetPath) {
                throw statError;
            }
            throw { code: 'ENOENT' };
        });

        // Since only a warning is logged, and no actual conflict is added to conflictMessages,
        // it should still exit with 0 if no other conflicts are found.
        await expect(detectConflictsActionLogic({}, services)).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_0');
        expect(loggerMocks.warn).toHaveBeenCalledWith(`Could not check symlink target '${symlinkTargetPath}': ${statError.message}`);
        expect(loggerMocks.info).toHaveBeenCalledWith('No conflicts detected.');
        expect(exitCli).toHaveBeenCalledWith(0);
    });
  });
});