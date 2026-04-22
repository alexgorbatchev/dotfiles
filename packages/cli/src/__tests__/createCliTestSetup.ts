import type { ProjectConfig } from "@dotfiles/config";
import { Architecture, type ISystemInfo, Platform } from "@dotfiles/core";
import { createMemFileSystem, type IMemFileSystemReturn } from "@dotfiles/file-system";
import { TestLogger } from "@dotfiles/logger";
import { createMockFileRegistry } from "@dotfiles/registry/file";
import {
  createMockProjectConfig,
  createTestDirectories,
  type ITestDirectories,
  type MockedInterface,
} from "@dotfiles/testing-helpers";
import { VersionComparisonStatus } from "@dotfiles/version-checker";
import { mock } from "bun:test";
import path from "node:path";
import { createProgram } from "../createProgram";
import type { IGlobalProgram, IServices } from "../types";

/**
 * Options for creating customizable service mocks.
 * Each property can be either:
 * - `true` to create a default mock for that service
 * - A mock implementation for that service
 */
type ServicesConfig = {
  [K in keyof IServices]?: MockedInterface<IServices[K]> | true;
};

/**
 * Type for the collection of mocked services.
 * Each service that was configured will be available as a properly typed mock.
 */
type MockedServices = {
  [K in keyof IServices]?: MockedInterface<IServices[K]>;
};

interface ICliTestSetupOptions {
  testName: string;
  memFileSystem?: Parameters<typeof createMemFileSystem>[0];
  services?: ServicesConfig;
}

interface ICliTestSetup {
  program: IGlobalProgram;
  logger: TestLogger;
  mockFs: IMemFileSystemReturn;
  testDirs: ITestDirectories;
  mockProjectConfig: ProjectConfig;
  mockServices: MockedServices;
  createServices: () => MockedInterface<IServices>;
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
export async function createCliTestSetup(options: ICliTestSetupOptions): Promise<ICliTestSetup> {
  const mockServices: MockedServices = {};
  const program = createProgram();
  const logger = new TestLogger();
  const mockFs = await createMemFileSystem(options.memFileSystem || {});
  const testDirs = await createTestDirectories(logger, mockFs.fs, { testName: options.testName });

  const systemInfo: ISystemInfo = {
    platform: Platform.Linux,
    arch: Architecture.X86_64,
    homeDir: testDirs.paths.homeDir,
    hostname: "test-host",
  };

  // Create the CLI source directory structure for __dirname resolution
  const cliSrcDir: string = path.join(__dirname, "..");
  await mockFs.fs.mkdir(cliSrcDir, { recursive: true });

  const mockProjectConfig = await createMockProjectConfig({
    config: {
      paths: testDirs.paths,
    },
    filePath: path.join(testDirs.paths.dotfilesDir, "dotfiles.config.ts"),
    fileSystem: mockFs.fs,
    logger,
    systemInfo,
    env: {},
  });

  if (options.services) {
    for (const [serviceName, serviceConfig] of Object.entries(options.services)) {
      if (serviceConfig === true) {
        // Create default mock for this service
        switch (serviceName as keyof IServices) {
          case "configService":
            mockServices.configService = {
              loadSingleToolConfig: mock(async () => undefined),
              loadToolConfigs: mock(async () => ({})),
              loadToolConfigByBinary: mock(async () => undefined),
            };
            break;
          case "installer":
            mockServices.installer = {
              install: mock(async () => ({
                success: true as const,
                binaryPaths: ["/fake/bin/tool"],
                version: "1.0.0",
                metadata: {
                  method: "brew" as const,
                  formula: "test",
                  isCask: false,
                },
              })),
            };
            break;
          case "githubApiClient":
            mockServices.githubApiClient = {
              getLatestRelease: mock(async () => ({
                id: 1,
                tag_name: "v1.0.0",
                name: "Release v1.0.0",
                draft: false,
                prerelease: false,
                created_at: new Date().toISOString(),
                published_at: new Date().toISOString(),
                assets: [],
                html_url: "https://github.com/owner/repo/releases/tag/v1.0.0",
                body: "Release body",
              })),
              getReleaseByTag: mock(async () => null),
              getAllReleases: mock(async () => []),
              getReleaseByConstraint: mock(async () => null),
              getRateLimit: mock(async () => ({
                remaining: 5000,
                limit: 5000,
                reset: Date.now() + 3600000,
                used: 0,
                resource: "core",
              })),
              probeLatestTag: mock(async () => null),
              getLatestReleaseTags: mock(async () => []),
            };
            break;
          case "versionChecker":
            mockServices.versionChecker = {
              checkVersionStatus: mock(
                async (_currentVersion: string, _latestVersion: string) => VersionComparisonStatus.NEWER_AVAILABLE,
              ),
              getLatestToolVersion: mock(async () => "1.0.0"),
            };
            break;
          case "fileRegistry":
            mockServices.fileRegistry = createMockFileRegistry();
            break;
          case "toolInstallationRegistry":
            mockServices.toolInstallationRegistry = {
              recordToolInstallation: mock(async () => {}),
              getToolInstallation: mock(async () => null),
              getAllToolInstallations: mock(async () => []),
              updateToolInstallation: mock(async () => {}),
              removeToolInstallation: mock(async () => {}),
              isToolInstalled: mock(async () => false),
              recordToolUsage: mock(async () => {}),
              getToolUsage: mock(async () => null),
              close: mock(async () => {}),
            };
            break;
          case "readmeService":
            mockServices.readmeService = {
              fetchReadmeForVersion: mock(async () => null),
              getCachedReadme: mock(async () => null),
              generateCombinedReadme: mock(async () => "Combined README"),
              getGitHubTools: mock(async () => []),
              clearExpiredCache: mock(async () => undefined),
              writeReadmeToPath: mock(async () => null),
              generateCatalogFromConfigs: mock(async () => "/path/to/catalog"),
            };
            break;
          case "cargoClient":
            mockServices.cargoClient = {
              getCrateMetadata: mock(async () => null),
              buildCargoTomlUrl: mock(() => "https://example.com/Cargo.toml"),
              getCargoTomlPackage: mock(async () => null),
              getLatestVersion: mock(async () => "1.0.0"),
            };
            break;
          case "systemInfo":
            mockServices.systemInfo = systemInfo;
            break;
        }
      } else {
        // Use provided mock directly - bypass strict typing for test setup
        const serviceKey = serviceName as keyof IServices;
        // @ts-expect-error: Test utility needs to bypass strict service typing
        mockServices[serviceKey] = serviceConfig as unknown;
      }
    }
  }

  const createServices = (): MockedInterface<IServices> =>
    ({
      projectConfig: mockProjectConfig,
      fs: mockFs.fs.asIFileSystem,
      systemInfo,
      // Default mocks for all required services
      configService: {
        loadSingleToolConfig: mock(async () => undefined),
        // @ts-expect-error: Mock returns empty array for testing
        loadToolConfigs: mock(async () => [] as IServices["configService"]["loadToolConfigs"]),
      },
      readmeService: {
        fetchReadmeForVersion: mock(async () => null),
        getCachedReadme: mock(async () => null),
        generateCombinedReadme: mock(async () => "# Combined README\n"),
        getGitHubTools: mock(async () => []),
        clearExpiredCache: mock(async () => {}),
        writeReadmeToPath: mock(async () => null),
        generateCatalogFromConfigs: mock(async () => "/path/to/catalog.md"),
      },
      pluginRegistry: {
        get: mock(() => undefined),
        register: mock(async () => undefined),
        getAll: mock(() => []),
        getExternallyManagedMethods: mock(() => new Set<string>()),
      },
      toolInstallationRegistry: {
        recordToolInstallation: mock(async () => {}),
        getToolInstallation: mock(async () => null),
        getAllToolInstallations: mock(async () => []),
        updateToolInstallation: mock(async () => {}),
        removeToolInstallation: mock(async () => {}),
        isToolInstalled: mock(async () => false),
        recordToolUsage: mock(async () => {}),
        getToolUsage: mock(async () => null),
        close: mock(async () => {}),
      },
      ...mockServices,
    }) as unknown as MockedInterface<IServices>;

  return {
    program,
    logger,
    mockFs,
    testDirs,
    mockProjectConfig,
    mockServices,
    createServices,
  };
}
