import type { IConfigService, ProjectConfig } from '@dotfiles/config';
import type { IInstallerPlugin, InstallerPluginRegistry, ToolConfig } from '@dotfiles/core';
import type { IInstaller, InstallResult } from '@dotfiles/installer';
import type {
  GithubReleaseToolConfig,
  IGitHubReleaseInstallMetadata,
  IGitHubReleaseInstallSuccess,
} from '@dotfiles/installer-github';
import type { TestLogger } from '@dotfiles/logger';
import type { IToolInstallationRecord, IToolInstallationRegistry } from '@dotfiles/registry/tool';
import type { MockedInterface } from '@dotfiles/testing-helpers';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { messages } from '../log-messages';
import type { IGlobalProgram } from '../types';
import { registerUpdateCommand } from '../updateCommand';
import { createCliTestSetup } from './createCliTestSetup';

describe('updateCommand', () => {
  let program: IGlobalProgram;
  let mockProjectConfig: ProjectConfig;
  let logger: TestLogger;
  let mockConfigService: MockedInterface<IConfigService>;
  let mockToolInstallationRegistry: MockedInterface<IToolInstallationRegistry>;
  let mockInstaller: MockedInterface<IInstaller>;
  let mockPluginRegistry: Partial<MockedInterface<InstallerPluginRegistry>>;

  const fzfToolConfig: GithubReleaseToolConfig = {
    name: 'fzf',
    version: 'latest',
    installationMethod: 'github-release',
    installParams: { repo: 'junegunn/fzf' },
    binaries: ['fzf'],
  };

  const pinnedToolConfig: ToolConfig = {
    name: 'pinnedtool',
    version: '1.0.0',
    installationMethod: 'github-release',
    installParams: { repo: 'owner/pinnedtool' },
    binaries: ['pinnedtool'],
  };

  const githubReleaseMetadata: IGitHubReleaseInstallMetadata = {
    method: 'github-release',
    releaseUrl: 'https://example.com/releases/v0.0.0',
    publishedAt: '2025-01-01T00:00:00Z',
    releaseName: 'Release v0.0.0',
  };

  beforeEach(async () => {
    mockConfigService = {
      loadSingleToolConfig: mock(async () => fzfToolConfig),
      loadToolConfigs: mock(async () => ({})),
      loadToolConfigByBinary: mock(async () => undefined),
    };

    mockToolInstallationRegistry = {
      recordToolInstallation: mock(async () => undefined),
      getToolInstallation: mock(async () => null),
      getAllToolInstallations: mock(async () => []),
      updateToolInstallation: mock(async () => undefined),
      removeToolInstallation: mock(async () => undefined),
      isToolInstalled: mock(async () => false),
      recordToolUsage: mock(async () => undefined),
      getToolUsage: mock(async () => null),
      close: mock(async () => undefined),
    };

    mockInstaller = {
      install: mock(async (): Promise<IGitHubReleaseInstallSuccess> => {
        const result: IGitHubReleaseInstallSuccess = {
          success: true,
          binaryPaths: ['/fake/bin/fzf'],
          version: '0.41.0',
          originalTag: 'v0.41.0',
          metadata: githubReleaseMetadata,
        };
        return result;
      }),
    };

    mockPluginRegistry = {
      get: mock(() => ({ supportsUpdate: () => true }) as unknown as IInstallerPlugin),
      register: mock(async () => undefined),
      getAll: mock(() => []),
    };

    const setup = await createCliTestSetup({
      testName: 'update-command',
      memFileSystem: { exists: mock(async () => true) },
      services: {
        configService: mockConfigService,
        toolInstallationRegistry: mockToolInstallationRegistry,
        installer: mockInstaller,
      },
    });

    program = setup.program;
    logger = setup.logger;
    mockProjectConfig = setup.mockProjectConfig;

    registerUpdateCommand(logger, program, async () => {
      const services = setup.createServices();

      services.configService = mockConfigService;
      services.toolInstallationRegistry = mockToolInstallationRegistry;
      services.installer = mockInstaller;
      services.pluginRegistry = mockPluginRegistry as unknown as InstallerPluginRegistry;

      return services;
    });
  });

  afterEach(() => {
    // Clean up any test state if needed
  });

  afterAll(() => {
    // Clean up any global test state if needed
  });

  test('tool is up-to-date', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(fzfToolConfig);

    const installationRecord: IToolInstallationRecord = {
      id: 1,
      toolName: 'fzf',
      version: '0.40.0',
      installPath: '/fake/install',
      timestamp: '2025-01-01-00-00-00',
      binaryPaths: ['/fake/install/fzf'],
      installedAt: new Date(),
    };
    mockToolInstallationRegistry.getToolInstallation.mockResolvedValue(installationRecord);

    mockInstaller.install.mockImplementation(async (): Promise<IGitHubReleaseInstallSuccess> => {
      const result: IGitHubReleaseInstallSuccess = {
        success: true,
        binaryPaths: ['/fake/bin/fzf'],
        version: '0.40.0',
        originalTag: 'v0.40.0',
        metadata: githubReleaseMetadata,
      };
      return result;
    });

    await program.parseAsync(['update', 'fzf'], { from: 'user' });

    logger.expect(
      ['INFO'],
      ['registerUpdateCommand'],
      [],
      [messages.commandCheckingUpdatesFor('fzf'), messages.toolUpdated('fzf', '0.40.0', '0.40.0')],
    );

    expect(mockInstaller.install).toHaveBeenCalled();
  });

  test('update available, successful installation', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(fzfToolConfig);

    const installationRecord: IToolInstallationRecord = {
      id: 1,
      toolName: 'fzf',
      version: '0.40.0',
      installPath: '/fake/install',
      timestamp: '2025-01-01-00-00-00',
      binaryPaths: ['/fake/install/fzf'],
      installedAt: new Date(),
    };
    mockToolInstallationRegistry.getToolInstallation.mockResolvedValue(installationRecord);

    mockInstaller.install.mockImplementation(async (): Promise<IGitHubReleaseInstallSuccess> => {
      const result: IGitHubReleaseInstallSuccess = {
        success: true,
        binaryPaths: ['/fake/bin/fzf'],
        version: '0.41.0',
        originalTag: 'v0.41.0',
        metadata: githubReleaseMetadata,
      };
      return result;
    });

    await program.parseAsync(['update', 'fzf'], { from: 'user' });

    logger.expect(
      ['INFO'],
      ['registerUpdateCommand'],
      [],
      [messages.commandCheckingUpdatesFor('fzf'), messages.toolUpdated('fzf', '0.40.0', '0.41.0')],
    );
    expect(mockInstaller.install).toHaveBeenCalled();
  });

  test('update available, installation fails', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    mockInstaller.install.mockImplementation(async (): Promise<InstallResult> => {
      const result: InstallResult = {
        success: false,
        error: 'Install failed miserably',
      };
      return result;
    });

    expect(program.parseAsync(['update', 'fzf'], { from: 'user' })).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');

    logger.expect(
      ['ERROR'],
      ['registerUpdateCommand'],
      [],
      [messages.toolUpdateFailed('fzf', 'Install failed miserably')],
    );
  });

  test('tool config not found', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(undefined);

    expect(program.parseAsync(['update', 'nonexistent'], { from: 'user' })).rejects.toThrow(
      'MOCK_EXIT_CLI_CALLED_WITH_1',
    );

    logger.expect(
      ['ERROR'],
      ['registerUpdateCommand'],
      [],
      [messages.toolNotFound('nonexistent', mockProjectConfig.paths.toolConfigsDir)],
    );
  });

  test('pinned version is rejected', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(pinnedToolConfig);

    await program.parseAsync(['update', 'pinnedtool'], { from: 'user' });

    logger.expect(
      ['INFO'],
      ['registerUpdateCommand'],
      [],
      [
        messages.commandCheckingUpdatesFor('pinnedtool'),
        messages.toolVersionPinned('pinnedtool', '1.0.0'),
      ],
    );
    expect(mockInstaller.install).not.toHaveBeenCalled();
  });

  test('unsupported plugin warns and performs regular install', async () => {
    const curlToolConfig: ToolConfig = {
      name: 'mytool',
      version: 'latest',
      installationMethod: 'curl-binary',
      installParams: { url: 'https://example.com/mytool' },
      binaries: ['mytool'],
    };
    mockConfigService.loadSingleToolConfig.mockResolvedValue(curlToolConfig);
    mockPluginRegistry.get!.mockReturnValue({ supportsUpdate: () => false } as unknown as IInstallerPlugin);

    const installationRecord: IToolInstallationRecord = {
      id: 1,
      toolName: 'mytool',
      version: '1.0.0',
      installPath: '/fake/install',
      timestamp: '2025-01-01-00-00-00',
      binaryPaths: ['/fake/install/mytool'],
      installedAt: new Date(),
    };
    mockToolInstallationRegistry.getToolInstallation.mockResolvedValue(installationRecord);

    await program.parseAsync(['update', 'mytool'], { from: 'user' });

    logger.expect(
      ['WARN', 'INFO'],
      ['registerUpdateCommand'],
      [],
      [
        messages.commandCheckingUpdatesFor('mytool'),
        messages.toolUpdateNotSupported('mytool', 'curl-binary'),
        messages.toolUpdated('mytool', '1.0.0', '0.41.0'),
      ],
    );
    expect(mockInstaller.install).toHaveBeenCalled();
  });

  test('GitHub API error when fetching latest release', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    mockInstaller.install.mockImplementation(async (): Promise<InstallResult> => {
      const result: InstallResult = {
        success: false,
        error: 'GitHub API failed',
      };
      return result;
    });

    expect(program.parseAsync(['update', 'fzf'], { from: 'user' })).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');

    logger.expect(['ERROR'], ['registerUpdateCommand'], [], [messages.toolUpdateFailed('fzf', 'GitHub API failed')]);
  });

  test('tool configured with "latest" version', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(fzfToolConfig);

    const installationRecord: IToolInstallationRecord = {
      id: 1,
      toolName: 'fzf',
      version: 'latest',
      installPath: '/fake/install',
      timestamp: '2025-01-01-00-00-00',
      binaryPaths: ['/fake/install/fzf'],
      installedAt: new Date(),
    };
    mockToolInstallationRegistry.getToolInstallation.mockResolvedValue(installationRecord);

    mockInstaller.install.mockImplementation(async (): Promise<IGitHubReleaseInstallSuccess> => {
      const result: IGitHubReleaseInstallSuccess = {
        success: true,
        binaryPaths: ['/fake/bin/fzf'],
        version: '0.50.0',
        originalTag: 'v0.50.0',
        metadata: githubReleaseMetadata,
      };
      return result;
    });

    await program.parseAsync(['update', 'fzf'], { from: 'user' });

    logger.expect(
      ['INFO'],
      ['registerUpdateCommand'],
      [],
      [messages.commandCheckingUpdatesFor('fzf'), messages.toolUpdated('fzf', 'latest', '0.50.0')],
    );
    expect(mockInstaller.install).toHaveBeenCalled();
  });

  describe('shim mode', () => {
    test('should use concise output when --shim-mode flag is provided', async () => {
      mockConfigService.loadSingleToolConfig.mockResolvedValue(fzfToolConfig);
      const installationRecord: IToolInstallationRecord = {
        id: 1,
        toolName: 'fzf',
        version: '0.40.0',
        installPath: '/fake/install',
        timestamp: '2025-01-01-00-00-00',
        binaryPaths: ['/fake/install/fzf'],
        installedAt: new Date(),
      };
      mockToolInstallationRegistry.getToolInstallation.mockResolvedValue(installationRecord);

      mockInstaller.install.mockImplementation(async (): Promise<IGitHubReleaseInstallSuccess> => {
        const result: IGitHubReleaseInstallSuccess = {
          success: true,
          binaryPaths: ['/fake/bin/fzf'],
          version: '0.41.0',
          originalTag: 'v0.41.0',
          metadata: githubReleaseMetadata,
        };
        return result;
      });

      await program.parseAsync(['update', 'fzf', '--shim-mode'], { from: 'user' });

      logger.expect(
        ['INFO'],
        ['registerUpdateCommand'],
        [],
        [messages.toolShimUpdateStarting('fzf', '0.40.0', '0.41.0'), messages.toolShimUpdateSuccess('fzf', '0.41.0')],
      );
      expect(mockInstaller.install).toHaveBeenCalled();
    });

    test('should show concise message when tool is already latest in shim mode', async () => {
      mockConfigService.loadSingleToolConfig.mockResolvedValue(fzfToolConfig);

      const installationRecord: IToolInstallationRecord = {
        id: 1,
        toolName: 'fzf',
        version: 'latest',
        installPath: '/fake/install',
        timestamp: '2025-01-01-00-00-00',
        binaryPaths: ['/fake/install/fzf'],
        installedAt: new Date(),
      };
      mockToolInstallationRegistry.getToolInstallation.mockResolvedValue(installationRecord);

      mockInstaller.install.mockImplementation(async (): Promise<IGitHubReleaseInstallSuccess> => {
        const result: IGitHubReleaseInstallSuccess = {
          success: true,
          binaryPaths: ['/fake/bin/fzf'],
          version: '0.41.0',
          originalTag: 'v0.41.0',
          metadata: githubReleaseMetadata,
        };
        return result;
      });

      await program.parseAsync(['update', 'fzf', '--shim-mode'], { from: 'user' });

      logger.expect(
        ['INFO'],
        ['registerUpdateCommand'],
        [],
        [messages.toolShimUpdateStarting('fzf', 'latest', '0.41.0'), messages.toolShimUpdateSuccess('fzf', '0.41.0')],
      );
      expect(mockInstaller.install).toHaveBeenCalled();
    });

    test('should show concise message when tool is already up to date in shim mode', async () => {
      mockConfigService.loadSingleToolConfig.mockResolvedValue(fzfToolConfig);

      const installationRecord: IToolInstallationRecord = {
        id: 1,
        toolName: 'fzf',
        version: '0.40.0',
        installPath: '/fake/install',
        timestamp: '2025-01-01-00-00-00',
        binaryPaths: ['/fake/install/fzf'],
        installedAt: new Date(),
      };
      mockToolInstallationRegistry.getToolInstallation.mockResolvedValue(installationRecord);

      mockInstaller.install.mockImplementation(async (): Promise<IGitHubReleaseInstallSuccess> => {
        const result: IGitHubReleaseInstallSuccess = {
          success: true,
          binaryPaths: ['/fake/bin/fzf'],
          version: '0.40.0',
          originalTag: 'v0.40.0',
          metadata: githubReleaseMetadata,
        };
        return result;
      });

      await program.parseAsync(['update', 'fzf', '--shim-mode'], { from: 'user' });

      logger.expect(['INFO'], ['registerUpdateCommand'], [], [messages.toolShimUpToDate('fzf', '0.40.0')]);
      expect(mockInstaller.install).toHaveBeenCalled();
    });

    test('should skip "checking updates" message in shim mode', async () => {
      mockConfigService.loadSingleToolConfig.mockResolvedValue(fzfToolConfig);

      const installationRecord: IToolInstallationRecord = {
        id: 1,
        toolName: 'fzf',
        version: '0.40.0',
        installPath: '/fake/install',
        timestamp: '2025-01-01-00-00-00',
        binaryPaths: ['/fake/install/fzf'],
        installedAt: new Date(),
      };
      mockToolInstallationRegistry.getToolInstallation.mockResolvedValue(installationRecord);

      mockInstaller.install.mockImplementation(async (): Promise<IGitHubReleaseInstallSuccess> => {
        const result: IGitHubReleaseInstallSuccess = {
          success: true,
          binaryPaths: ['/fake/bin/fzf'],
          version: '0.40.0',
          originalTag: 'v0.40.0',
          metadata: githubReleaseMetadata,
        };
        return result;
      });

      await program.parseAsync(['update', 'fzf', '--shim-mode'], { from: 'user' });

      logger.expect(['INFO'], ['registerUpdateCommand'], [], [messages.toolShimUpToDate('fzf', '0.40.0')]);
      expect(mockInstaller.install).toHaveBeenCalled();
    });
  });
});
