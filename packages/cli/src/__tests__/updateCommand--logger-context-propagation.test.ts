/**
 * Integration tests for logger context propagation in the update command.
 *
 * Verifies that tool name context flows through log messages during updates.
 */
import type { IConfigService } from '@dotfiles/config';
import type { IInstallerPlugin } from '@dotfiles/core';
import type { IInstaller, InstallResult } from '@dotfiles/installer';
import type { GithubReleaseToolConfig, IGitHubReleaseInstallMetadata } from '@dotfiles/installer-github';
import type { TestLogger } from '@dotfiles/logger';
import type { IToolInstallationRecord, IToolInstallationRegistry } from '@dotfiles/registry/tool';
import type { MockedInterface } from '@dotfiles/testing-helpers';
import { beforeEach, describe, mock, test } from 'bun:test';
import { z } from 'zod';
import { messages } from '../log-messages';
import type { IGlobalProgram } from '../types';
import { registerUpdateCommand } from '../updateCommand';
import { createCliTestSetup } from './createCliTestSetup';

describe('updateCommand - Logger Context Propagation', () => {
  let program: IGlobalProgram;
  let mockPlugin: IInstallerPlugin;
  let logger: TestLogger;
  let mockConfigService: MockedInterface<IConfigService>;
  let mockToolInstallationRegistry: MockedInterface<IToolInstallationRegistry>;
  let mockInstaller: MockedInterface<IInstaller>;

  const TOOL_NAME = 'test-tool';

  const toolConfig: GithubReleaseToolConfig = {
    name: TOOL_NAME,
    version: '1.0.0',
    installationMethod: 'github-release',
    installParams: { repo: 'owner/test-tool' },
    binaries: ['test-tool'],
  };

  const githubReleaseMetadata: IGitHubReleaseInstallMetadata = {
    method: 'github-release',
    releaseUrl: 'https://example.com/releases/v1.0.0',
    publishedAt: '2025-01-01T00:00:00Z',
    releaseName: 'Release v1.0.0',
  };

  beforeEach(async () => {
    mockConfigService = {
      loadSingleToolConfig: mock(async () => toolConfig),
      loadToolConfigs: mock(async () => ({})),
    };

    mockToolInstallationRegistry = {
      recordToolInstallation: mock(async () => undefined),
      getToolInstallation: mock(async () => null),
      getAllToolInstallations: mock(async () => []),
      updateToolInstallation: mock(async () => undefined),
      removeToolInstallation: mock(async () => undefined),
      isToolInstalled: mock(async () => false),
      close: mock(async () => undefined),
    };

    mockInstaller = {
      install: mock(
        async (): Promise<InstallResult> => ({
          success: true,
          binaryPaths: ['/fake/bin/test-tool'],
          version: '1.1.0',
          originalTag: 'v1.1.0',
          metadata: githubReleaseMetadata,
        }),
      ),
    };

    mockPlugin = {
      method: 'github-release',
      displayName: 'Mock GitHub Release',
      version: '1.0.0',
      paramsSchema: z.unknown(),
      toolConfigSchema: z.unknown(),
      install: mock(async () => ({ success: false as const, error: 'not used' })),
      supportsUpdate: mock(() => true),
    };

    const setup = await createCliTestSetup({
      testName: 'update-logger-context',
      memFileSystem: { exists: mock(async () => true) },
      services: {
        configService: mockConfigService,
        toolInstallationRegistry: mockToolInstallationRegistry,
        installer: mockInstaller,
      },
    });

    program = setup.program;
    logger = setup.logger;

    registerUpdateCommand(logger, program, async () => {
      const services = setup.createServices();

      services.pluginRegistry.get = mock((method) => (method === 'github-release' ? mockPlugin : undefined));
      services.configService = mockConfigService;
      services.toolInstallationRegistry = mockToolInstallationRegistry;
      services.installer = mockInstaller;

      return services;
    });
  });

  test('should include tool name in log messages when update succeeds', async () => {
    const installationRecord: IToolInstallationRecord = {
      id: 1,
      toolName: TOOL_NAME,
      version: '1.0.0',
      installPath: '/fake/install',
      timestamp: '2025-01-01-00-00-00',
      binaryPaths: ['/fake/install/test-tool'],
      installedAt: new Date(),
    };
    mockToolInstallationRegistry.getToolInstallation.mockResolvedValue(installationRecord);

    await program.parseAsync(['update', TOOL_NAME], { from: 'user' });

    logger.expect(
      ['INFO'],
      ['registerUpdateCommand'],
      [],
      [messages.commandCheckingUpdatesFor(TOOL_NAME), messages.toolUpdated(TOOL_NAME, '1.0.0', '1.1.0')],
    );
  });

  test('should include tool name in log messages when tool is up-to-date', async () => {
    const installationRecord: IToolInstallationRecord = {
      id: 1,
      toolName: TOOL_NAME,
      version: '1.0.0',
      installPath: '/fake/install',
      timestamp: '2025-01-01-00-00-00',
      binaryPaths: ['/fake/install/test-tool'],
      installedAt: new Date(),
    };
    mockToolInstallationRegistry.getToolInstallation.mockResolvedValue(installationRecord);

    mockInstaller.install.mockImplementation(
      async (): Promise<InstallResult> => ({
        success: true,
        binaryPaths: ['/fake/bin/test-tool'],
        version: '1.0.0',
        originalTag: 'v1.0.0',
        metadata: githubReleaseMetadata,
      }),
    );

    await program.parseAsync(['update', TOOL_NAME], { from: 'user' });

    logger.expect(
      ['INFO'],
      ['registerUpdateCommand'],
      [],
      [messages.commandCheckingUpdatesFor(TOOL_NAME), messages.toolUpdated(TOOL_NAME, '1.0.0', '1.0.0')],
    );
  });
});
