import { expect, test, describe, mock, beforeEach, afterEach } from 'bun:test'; // Removed spyOn
import { Command } from 'commander';
import type { AppConfig } from '@modules/config';
import type { IFileSystem } from '@modules/file-system';
import type { IVersionChecker } from '@modules/version-checker';
import { VersionComparisonStatus } from '@modules/version-checker/IVersionChecker';
import type { IGitHubApiClient } from '@modules/github-client';
import type { ConsolaInstance } from 'consola';
import { registerCheckUpdatesCommand } from '../checkUpdatesCommand'; // Removed CheckUpdatesCommandServices
import { loadSingleToolConfig, loadToolConfigsFromDirectory } from '@modules/config-loader/loadToolConfigs';
import { createClientLogger as actualCreateClientLogger } from '@modules/logger';
import { setupServices as actualSetupServices } from '../../../cli'; // Import actual setupServices
import type { GithubReleaseToolConfig, ToolConfig, GitHubRelease } from '@types';

// Mock dependencies
mock.module('@modules/config-loader/loadToolConfigs', () => ({
  loadToolConfigsFromDirectory: mock(async () => ({})),
  loadSingleToolConfig: mock(async () => undefined),
}));

// Mock @modules/logger
const mockCreateClientLogger = mock(actualCreateClientLogger);
mock.module('@modules/logger', () => ({
  createClientLogger: mockCreateClientLogger,
  createLogger: mock(() => mock(() => {})),
}));

// Mock ../../cli
const mockSetupServices = mock(actualSetupServices);
mock.module('../../../cli', () => ({
  setupServices: mockSetupServices,
  // Mock other exports from cli.ts if they were to be used by checkUpdatesCommand.ts
  // For now, only setupServices is directly imported.
}));


describe('checkUpdatesCommand', () => {
  let program: Command;
  let mockAppConfig: Partial<AppConfig>;
  let mockFileSystem: Partial<IFileSystem>;
  let mockVersionChecker: Partial<IVersionChecker>;
  let mockGitHubApiClient: Partial<IGitHubApiClient>;
  let mockClientLogger: Partial<ConsolaInstance>;
  // let services: Omit<CheckUpdatesCommandServices, 'clientLogger'>; // This variable is no longer used
  // consoleLogSpy and other console spies are no longer needed as we mock createClientLogger directly
  beforeEach(() => {
    program = new Command();

    mockAppConfig = {
      toolConfigsDir: '/fake/tools',
      manifestPath: '/fake/manifest.json',
    };

    mockFileSystem = {
      exists: mock(async () => true),
      readFile: mock(async () => ''),
      readdir: mock(async () => []),
    };

    mockVersionChecker = {
      checkVersionStatus: mock(async () => VersionComparisonStatus.UP_TO_DATE),
      getLatestToolVersion: mock(async () => null)
    };

    mockGitHubApiClient = {
      getLatestRelease: mock(async (owner: string, repo: string): Promise<GitHubRelease | null> => ({
        id: 123,
        tag_name: '1.0.0',
        name: 'Release 1.0.0',
        draft: false,
        prerelease: false,
        created_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
        assets: [],
        html_url: `https://github.com/${owner}/${repo}/releases/tag/1.0.0`,
        body: 'Release body'
      })),
    };

    // Create a fully mocked ConsolaInstance
    const createMockLogFn = () => Object.assign(mock(() => {}), { raw: mock(() => {}) });
    mockClientLogger = {
      log: createMockLogFn(),
      error: createMockLogFn(),
      warn: createMockLogFn(),
      info: createMockLogFn(),
      debug: createMockLogFn(),
      success: createMockLogFn(),
      fatal: createMockLogFn(),
      trace: createMockLogFn(),
      verbose: createMockLogFn(),
      // Add any other properties/methods if ConsolaInstance has them
      // For example, if it has a 'prompt' or other interactive methods.
      // Basic methods for logging should be sufficient for this command.
    }; // Removed 'as ConsolaInstance' cast here


    // Configure the mock for createClientLogger to return our mockClientLogger instance
    mockCreateClientLogger.mockReturnValue(mockClientLogger as any);


    // No longer passing services directly to registerCheckUpdatesCommand
    
    // Configure mockSetupServices to return our mock core services
    // Note: checkUpdatesCommand's action handler maps 'fs' to 'fileSystem'
    mockSetupServices.mockResolvedValue({
      appConfig: mockAppConfig as AppConfig,
      fs: mockFileSystem as IFileSystem, // setupServices returns 'fs'
      versionChecker: mockVersionChecker as IVersionChecker,
      githubApiClient: mockGitHubApiClient as IGitHubApiClient,
      // Add other services if setupServices returns them and they might be used
      downloader: mock(async () => {}) as any,
      githubApiCache: {} as any,
      shimGenerator: {} as any,
      shellInitGenerator: {} as any,
      symlinkGenerator: {} as any,
      generatorOrchestrator: {} as any,
      installer: {} as any,
      archiveExtractor: {} as any,
    });
    
    registerCheckUpdatesCommand(program); // Call with only program
  });

  afterEach(() => {
    mock.restore(); // Restores all mocks created with bun:test's mock() (includes mockCreateClientLogger)
    // Individual console spy restores are not needed as we are mocking createClientLogger
  });

  const fzfToolConfig: GithubReleaseToolConfig = {
    name: 'fzf',
    version: '0.40.0',
    installationMethod: 'github-release',
    installParams: { repo: 'junegunn/fzf' },
    binaries: ['fzf'],
  };

  const lazygitToolConfig: GithubReleaseToolConfig = {
    name: 'lazygit',
    version: '0.35.0',
    installationMethod: 'github-release',
    installParams: { repo: 'jesseduffield/lazygit' },
    binaries: ['lazygit'],
  };
  
  const manualToolConfig: ToolConfig = {
    name: 'manualtool',
    version: '1.0.0',
    installationMethod: 'manual',
    installParams: { binaryPath: '/usr/local/bin/manualtool' },
    binaries: ['manualtool'],
  };

  test('should report a tool is up-to-date', async () => {
    (loadSingleToolConfig as any).mockResolvedValue(fzfToolConfig);
    (mockGitHubApiClient.getLatestRelease as any).mockResolvedValue({ tag_name: 'v0.40.0' });
    (mockVersionChecker.checkVersionStatus as any).mockResolvedValue(VersionComparisonStatus.UP_TO_DATE);

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    expect(mockClientLogger.info).toHaveBeenCalledWith('Check-updates command finished.');
    expect(mockClientLogger.log).toHaveBeenCalledWith('fzf (0.40.0) is up to date. Latest: 0.40.0');
  });

  test('should report an update is available', async () => {
    (loadSingleToolConfig as any).mockResolvedValue(fzfToolConfig); // configured 0.40.0
    (mockGitHubApiClient.getLatestRelease as any).mockResolvedValue({ tag_name: 'v0.41.0' });
    (mockVersionChecker.checkVersionStatus as any).mockResolvedValue(VersionComparisonStatus.NEWER_AVAILABLE);

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });
    
    expect(mockClientLogger.log).toHaveBeenCalledWith('Update available for fzf: 0.40.0 -> 0.41.0');
  });

  test('should check all tools: one up-to-date, one with update', async () => {
    (loadToolConfigsFromDirectory as any).mockResolvedValue({
      fzf: fzfToolConfig, // 0.40.0
      lazygit: lazygitToolConfig, // 0.35.0
    });

    (mockGitHubApiClient.getLatestRelease as any)
      .mockResolvedValueOnce({ tag_name: 'v0.40.0' }) // fzf latest
      .mockResolvedValueOnce({ tag_name: 'v0.36.0' }); // lazygit latest

    (mockVersionChecker.checkVersionStatus as any)
      .mockResolvedValueOnce(VersionComparisonStatus.UP_TO_DATE) // fzf
      .mockResolvedValueOnce(VersionComparisonStatus.NEWER_AVAILABLE); // lazygit

    await program.parseAsync(['check-updates'], { from: 'user' });

    expect(mockClientLogger.log).toHaveBeenCalledWith('fzf (0.40.0) is up to date. Latest: 0.40.0');
    expect(mockClientLogger.log).toHaveBeenCalledWith('Update available for lazygit: 0.35.0 -> 0.36.0');
    expect(mockClientLogger.info).toHaveBeenCalledWith('Check-updates command finished.');
  });
  
  test('should handle tool configured with "latest" version', async () => {
    const fzfLatestConfig: GithubReleaseToolConfig = { ...fzfToolConfig, version: 'latest' };
    (loadSingleToolConfig as any).mockResolvedValue(fzfLatestConfig);
    (mockGitHubApiClient.getLatestRelease as any).mockResolvedValue({ tag_name: 'v0.42.0' });

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    expect(mockClientLogger.log).toHaveBeenCalledWith('Tool "fzf" is configured to \'latest\'. The latest available version is 0.42.0.');
  });

  test('should report unsupported installation method', async () => {
    (loadSingleToolConfig as any).mockResolvedValue(manualToolConfig);
    await program.parseAsync(['check-updates', 'manualtool'], { from: 'user' });

    expect(mockClientLogger.log).toHaveBeenCalledWith('Update checking not yet supported for manualtool (method: manual)');
  });

  test('should handle GitHub API error gracefully', async () => {
    (loadSingleToolConfig as any).mockResolvedValue(fzfToolConfig);
    (mockGitHubApiClient.getLatestRelease as any).mockRejectedValue(new Error('GitHub API unavailable'));

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    expect(mockClientLogger.error).toHaveBeenCalledWith('Error checking GitHub updates for fzf: GitHub API unavailable');
  });
  
  test('should handle tool config not found for specific tool', async () => {
    (loadSingleToolConfig as any).mockResolvedValue(undefined);
    await program.parseAsync(['check-updates', 'nonexistenttool'], { from: 'user' });

    expect(mockClientLogger.error).toHaveBeenCalledWith('Tool configuration for "nonexistenttool" not found in /fake/tools.');
    // process.exitCode should be set
    expect(process.exitCode).toBe(1); // This needs to be asserted carefully, ensure it's set by the command logic
    process.exitCode = 0; // Reset for next tests, if process.exitCode is indeed modified by the command
  });

  test('should handle no tool configurations found when checking all', async () => {
    (loadToolConfigsFromDirectory as any).mockResolvedValue({});
    await program.parseAsync(['check-updates'], { from: 'user' });
    expect(mockClientLogger.info).toHaveBeenCalledWith('No tool configurations found in /fake/tools.');
  });
  
  test('should handle invalid repo format in tool config', async () => {
    const invalidRepoConfig: GithubReleaseToolConfig = { 
      ...fzfToolConfig, 
      name: 'invalidrepo',
      installParams: { repo: 'justonename' } 
    };
    (loadSingleToolConfig as any).mockResolvedValue(invalidRepoConfig);
    
    await program.parseAsync(['check-updates', 'invalidrepo'], { from: 'user' });
    
    expect(mockClientLogger.warn).toHaveBeenCalledWith("Invalid 'repo' format for \"invalidrepo\": justonename. Expected 'owner/repo'. Skipping.");
  });

  test('should handle missing repo in github-release tool config', async () => {
    const missingRepoConfig = { 
      ...fzfToolConfig, 
      name: 'missingrepo',
      installParams: { } // No repo
    } as GithubReleaseToolConfig; // Cast because repo is normally required by type but we test runtime robustness
    (loadSingleToolConfig as any).mockResolvedValue(missingRepoConfig);
    
    await program.parseAsync(['check-updates', 'missingrepo'], { from: 'user' });
    
    expect(mockClientLogger.warn).toHaveBeenCalledWith("Tool \"missingrepo\" is 'github-release' but missing 'repo' in installParams. Skipping.");
  });
  
  test('should handle error during loadToolConfigsFromDirectory', async () => {
    const errorMessage = 'FS read error';
    (loadToolConfigsFromDirectory as any).mockRejectedValue(new Error(errorMessage));
    await program.parseAsync(['check-updates'], { from: 'user' });
    expect(mockClientLogger.error).toHaveBeenCalledWith('Error loading tool configurations: %s', errorMessage);
    expect(process.exitCode).toBe(1);
    process.exitCode = 0; // Reset for subsequent tests
  });

  test('should handle error during loadSingleToolConfig', async () => {
    const errorMessage = 'FS read error single';
    (loadSingleToolConfig as any).mockRejectedValue(new Error(errorMessage));
    await program.parseAsync(['check-updates', 'sometool'], { from: 'user' });
    expect(mockClientLogger.error).toHaveBeenCalledWith('Error loading tool configurations: %s', errorMessage);
    expect(process.exitCode).toBe(1);
    process.exitCode = 0; // Reset for subsequent tests
  });

});