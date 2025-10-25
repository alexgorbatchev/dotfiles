import { mock } from 'bun:test';
import path from 'node:path';
import type { YamlConfig } from '@dotfiles/config';
import { createMemFileSystem, type MemFileSystemReturn } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createMockYamlConfig, createTestDirectories, type TestDirectories } from '@dotfiles/testing-helpers';
import { VersionComparisonStatus } from '@dotfiles/version-checker';
import { createProgram } from '../createProgram';
import type { GlobalProgram, Services } from '../types';
import { createMockFileRegistry } from './createMockFileRegistry';

/**
 * Options for creating customizable service mocks.
 * Each property can be either:
 * - `true` to create a default mock for that service
 * - A mock implementation for that service
 */
type ServicesConfig = {
  [K in keyof Services]?: Services[K] | true;
};

/**
 * Type for the collection of mocked services.
 * Each service that was configured will be available as a properly typed mock.
 */
type MockedServices = {
  [K in keyof Services]?: Services[K];
};

interface CliTestSetupOptions {
  testName: string;
  memFileSystem?: Parameters<typeof createMemFileSystem>[0];
  services?: ServicesConfig;
}

interface CliTestSetup {
  program: GlobalProgram;
  logger: TestLogger;
  mockFs: MemFileSystemReturn;
  testDirs: TestDirectories;
  mockYamlConfig: YamlConfig;
  mockServices: MockedServices;
  createServices: () => Services;
}

/**
 * Creates the common test setup used across CLI command tests.
 * Handles program, logger, file system, test directories, yaml config, and optional service mocks.
 *
 * @example
 * // Use true for default mocks
 * const setup = await createCliTestSetup({
 *   testName: 'my-test',
 *   services: {
 *     installer: true,
 *     githubApiClient: true
 *   }
 * });
 *
 * @example
 * // Pass custom mocks directly
 * const setup = await createCliTestSetup({
 *   testName: 'my-test',
 *   services: {
 *     installer: { install: mock(async () => ({ success: true })) },
 *     githubApiClient: { getLatestRelease: mock(async () => mockRelease) }
 *   }
 * });
 *
 * @example
 * // Mix default and custom mocks
 * const setup = await createCliTestSetup({
 *   testName: 'my-test',
 *   services: {
 *     installer: true, // default mock
 *     githubApiClient: { getLatestRelease: mock(async () => mockRelease) } // custom mock
 *   }
 * });
 */
export async function createCliTestSetup(options: CliTestSetupOptions): Promise<CliTestSetup> {
  const mockServices: MockedServices = {};
  const program = createProgram();
  const logger = new TestLogger();
  const mockFs = await createMemFileSystem(options.memFileSystem || {});
  const testDirs = await createTestDirectories(logger, mockFs.fs, { testName: options.testName });

  const mockYamlConfig = await createMockYamlConfig({
    config: {
      paths: testDirs.paths,
    },
    filePath: path.join(testDirs.paths.dotfilesDir, 'config.yaml'),
    fileSystem: mockFs.fs,
    logger,
    systemInfo: { platform: 'linux', arch: 'x64', homeDir: testDirs.paths.homeDir },
    env: {},
  });

  if (options.services) {
    for (const [serviceName, serviceConfig] of Object.entries(options.services)) {
      if (serviceConfig === true) {
        // Create default mock for this service
        switch (serviceName as keyof Services) {
          case 'installer':
            mockServices.installer = {
              install: mock(async () => ({
                success: true,
                binaryPath: '/fake/bin/tool',
                version: '1.0.0',
              })),
            };
            break;
          case 'githubApiClient':
            mockServices.githubApiClient = {
              getLatestRelease: mock(async () => ({
                id: 1,
                tag_name: 'v1.0.0',
                name: 'Release v1.0.0',
                draft: false,
                prerelease: false,
                created_at: new Date().toISOString(),
                published_at: new Date().toISOString(),
                assets: [],
                html_url: 'https://github.com/owner/repo/releases/tag/v1.0.0',
                body: 'Release body',
              })),
              getReleaseByTag: mock(async () => null),
              getAllReleases: mock(async () => []),
              getReleaseByConstraint: mock(async () => null),
              getRateLimit: mock(async () => ({
                remaining: 5000,
                limit: 5000,
                reset: Date.now() + 3600000,
                used: 0,
                resource: 'core',
              })),
            };
            break;
          case 'versionChecker':
            mockServices.versionChecker = {
              checkVersionStatus: mock(
                async (_currentVersion: string, _latestVersion: string) => VersionComparisonStatus.NEWER_AVAILABLE
              ),
              getLatestToolVersion: mock(async () => '1.0.0'),
            };
            break;
          case 'fileRegistry':
            mockServices.fileRegistry = createMockFileRegistry();
            break;
          case 'toolInstallationRegistry':
            mockServices.toolInstallationRegistry = {
              recordToolInstallation: mock(async () => {}),
              getToolInstallation: mock(async () => null),
              getAllToolInstallations: mock(async () => []),
              updateToolInstallation: mock(async () => {}),
              removeToolInstallation: mock(async () => {}),
              isToolInstalled: mock(async () => false),
              close: mock(async () => {}),
            };
            break;
        }
      } else {
        // Use provided mock directly - bypass strict typing for test setup
        const serviceKey = serviceName as keyof Services;
        // biome-ignore lint/suspicious/noExplicitAny: Test utility needs to bypass strict service typing
        mockServices[serviceKey] = serviceConfig as any;
      }
    }
  }

  const createServices = (): Services =>
    ({
      yamlConfig: mockYamlConfig,
      fs: mockFs.fs.asIFileSystem,
      ...mockServices,
    }) as Services;

  return {
    program,
    logger,
    mockFs,
    testDirs,
    mockYamlConfig,
    mockServices,
    createServices,
  };
}
