#!/usr/bin/env bun

import os from 'node:os';
import path from 'node:path';
import { FileCache, type ICache } from '@modules/cache';
import {
  registerCheckUpdatesCommand,
  registerCleanupCommand,
  registerDetectConflictsCommand,
  registerFilesCommand,
  registerGenerateCommand,
  registerInitCommand,
  registerInstallCommand,
  registerUpdateCommand,
} from '@modules/cli';
import { cliLogMessages } from '@modules/cli/log-messages';
import { ARCH_VALUES, OS_VALUES, type YamlConfig } from '@modules/config';
import { loadYamlConfig } from '@modules/config-loader';
import { Downloader, type IDownloader } from '@modules/downloader';
import { ArchiveExtractor, type IArchiveExtractor } from '@modules/extractor';
import { type IFileRegistry, SqliteFileRegistry, TrackedFileSystem } from '@modules/file-registry';
import { type IFileSystem, MemFileSystem, NodeFileSystem } from '@modules/file-system';
import { GeneratorOrchestrator, type IGeneratorOrchestrator } from '@modules/generator-orchestrator';
import { type IShellInitGenerator, ShellInitGenerator } from '@modules/generator-shell-init';
import { type IShimGenerator, ShimGenerator } from '@modules/generator-shim';
import { type ISymlinkGenerator, SymlinkGenerator } from '@modules/generator-symlink';
import { type IInstaller, Installer } from '@modules/installer';
import { CargoClient, type ICargoClient } from '@modules/installer/clients/cargo';
import { GitHubApiClient, type IGitHubApiClient } from '@modules/installer/clients/github';
import { createTsLogger, getLogLevelFromFlags, type TsLogger } from '@modules/logger';
import { RegistryDatabase } from '@modules/registry-database';
import { type IToolInstallationRegistry, SqliteToolInstallationRegistry } from '@modules/tool-installation-registry';
import { type IVersionChecker, VersionChecker } from '@modules/version-checker';
import type { SystemInfo } from '@types';
import { contractHomePath } from '@utils';
import { Command } from 'commander';

export interface Services {
  yamlConfig: YamlConfig;
  fs: IFileSystem;
  fileRegistry: IFileRegistry;
  toolInstallationRegistry: IToolInstallationRegistry;
  downloadCache: ICache | undefined;
  downloader: IDownloader;
  githubApiCache: ICache;
  cargoCratesIoCache: ICache;
  cargoGithubRawCache: ICache;
  githubApiClient: IGitHubApiClient;
  cargoClient: ICargoClient;
  shimGenerator: IShimGenerator;
  shellInitGenerator: IShellInitGenerator;
  symlinkGenerator: ISymlinkGenerator;
  generatorOrchestrator: IGeneratorOrchestrator;
  installer: IInstaller;
  archiveExtractor: IArchiveExtractor;
  versionChecker: IVersionChecker;
  systemInfo: SystemInfo;
}

type SetupServicesOptions = GlobalProgramOptions & {
  cwd: string;
  env: NodeJS.ProcessEnv;
};

function initializeFileSystem(logger: TsLogger, dryRun: boolean): IFileSystem {
  let fs: IFileSystem;
  if (dryRun) {
    logger.trace(cliLogMessages.dryRunEnabled());
    fs = new MemFileSystem({});
  } else {
    fs = new NodeFileSystem();
  }
  logger.trace(cliLogMessages.componentInitialized('filesystem'), fs.constructor.name);
  return fs;
}

function createSystemInfo(options: SetupServicesOptions, logger: TsLogger): SystemInfo {
  const systemInfo: SystemInfo = {
    platform: options.platform || process.platform,
    arch: options.arch || process.arch,
    homeDir: os.homedir(),
  };

  if (options.platform) {
    logger.warn(cliLogMessages.configParameterOverridden('platform', options.platform));
  }
  if (options.arch) {
    logger.warn(cliLogMessages.configParameterOverridden('arch', options.arch));
  }

  return systemInfo;
}

async function copyToolConfigFile(
  logger: TsLogger,
  fs: IFileSystem,
  nodeFs: NodeFileSystem,
  filePath: string,
  systemInfo: SystemInfo
): Promise<void> {
  try {
    const content = await nodeFs.readFile(filePath, 'utf8');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content);
    logger.trace(cliLogMessages.fsWrite('memfs', contractHomePath(systemInfo.homeDir, filePath)));
  } catch (readError: unknown) {
    const errorMessage = readError instanceof Error ? readError.message : String(readError);
    logger.warn(cliLogMessages.fsReadFailed(filePath, errorMessage));
    logger.error(cliLogMessages.fsReadFailed(filePath, String(readError)), readError);
  }
}

async function loadToolConfigsForDryRun(
  logger: TsLogger,
  fs: IFileSystem,
  yamlConfig: YamlConfig,
  systemInfo: SystemInfo
): Promise<void> {
  logger.trace(cliLogMessages.toolConfigsForDryRun());
  const realToolConfigsDir = yamlConfig.paths.toolConfigsDir;
  const nodeFs = new NodeFileSystem();

  try {
    if (!(await nodeFs.exists(realToolConfigsDir))) {
      logger.warn(cliLogMessages.fsItemNotFound('Tool configs directory', realToolConfigsDir));
      return;
    }

    logger.trace(cliLogMessages.toolConfigsLoaded(realToolConfigsDir, 0));
    const filesInDir = await nodeFs.readdir(realToolConfigsDir);

    for (const fileName of filesInDir) {
      if (fileName.endsWith('.tool.ts')) {
        const filePath = path.join(realToolConfigsDir, fileName);
        await copyToolConfigFile(logger, fs, nodeFs, filePath, systemInfo);
      }
    }
  } catch (_error) {
    logger.error(cliLogMessages.fsAccessDenied('accessing', realToolConfigsDir));
  }
}

function initializeDownloadCache(parentLogger: TsLogger, fs: IFileSystem, yamlConfig: YamlConfig): ICache | undefined {
  if (!yamlConfig.downloader.cache.enabled) {
    parentLogger.info(cliLogMessages.cachingDisabled());
    return undefined;
  }

  const cacheDir = path.join(yamlConfig.paths.generatedDir, 'cache', 'downloads');
  const downloadCache = new FileCache(parentLogger, fs, {
    enabled: true,
    defaultTtl: yamlConfig.downloader.cache.ttl,
    cacheDir,
    storageStrategy: 'binary',
  });

  parentLogger.debug(
    cliLogMessages.cachingEnabled(),
    `Directory: ${cacheDir} (TTL: ${yamlConfig.downloader.cache.ttl / 1000 / 60 / 60} hours)`
  );

  return downloadCache;
}

function createTrackedFileSystems(
  parentLogger: TsLogger,
  fs: IFileSystem,
  fileRegistry: IFileRegistry,
  systemInfo: SystemInfo
): {
  shimTrackedFs: TrackedFileSystem;
  shellInitTrackedFs: TrackedFileSystem;
  symlinkTrackedFs: TrackedFileSystem;
  installerTrackedFs: TrackedFileSystem;
} {
  const shimTrackedFs = new TrackedFileSystem(
    parentLogger,
    fs,
    fileRegistry,
    TrackedFileSystem.createContext('system', 'shim'),
    systemInfo.homeDir
  );

  const shellInitTrackedFs = new TrackedFileSystem(
    parentLogger,
    fs,
    fileRegistry,
    TrackedFileSystem.createContext('system', 'init'),
    systemInfo.homeDir
  );

  const symlinkTrackedFs = new TrackedFileSystem(
    parentLogger,
    fs,
    fileRegistry,
    TrackedFileSystem.createContext('system', 'symlink'),
    systemInfo.homeDir
  );

  const installerTrackedFs = new TrackedFileSystem(
    parentLogger,
    fs,
    fileRegistry,
    TrackedFileSystem.createContext('system', 'binary'),
    systemInfo.homeDir
  );

  return { shimTrackedFs, shellInitTrackedFs, symlinkTrackedFs, installerTrackedFs };
}

export async function setupServices(parentLogger: TsLogger, options: SetupServicesOptions): Promise<Services> {
  const logger = parentLogger.getSubLogger({ name: 'setupServices' });
  logger.trace(cliLogMessages.operationStarted('setupServices'), options);
  const { dryRun, env, config } = options;

  // Initialize filesystem first
  const fs = initializeFileSystem(logger, dryRun);
  const systemInfo = createSystemInfo(options, logger);

  // Default config path should be in the generator directory
  const userConfigPath = config.length === 0 ? path.resolve(path.dirname(__dirname), 'config.yaml') : config;

  // For config loading, use NodeFileSystem only in dry-run mode when running the CLI directly
  const isRunningDirectly = process.env.NODE_ENV !== 'test' && !process.env['BUN_TEST'];
  const configFs = dryRun && isRunningDirectly ? new NodeFileSystem() : fs;
  const yamlConfig = await loadYamlConfig(logger, configFs, userConfigPath, systemInfo, env);

  // Create final systemInfo with correct homeDir from yamlConfig
  const finalSystemInfo: SystemInfo = {
    platform: systemInfo.platform,
    arch: systemInfo.arch,
    homeDir: yamlConfig.paths.homeDir,
  };

  // If dry run, load tool configs into memory filesystem
  if (dryRun) {
    await loadToolConfigsForDryRun(logger, fs, yamlConfig, finalSystemInfo);
  }

  // Initialize download cache if enabled
  const downloadCache = initializeDownloadCache(parentLogger, fs, yamlConfig);

  // Initialize shared registry database
  const registryPath = path.join(yamlConfig.paths.generatedDir, 'registry.db');
  const registryDatabase = new RegistryDatabase(parentLogger, registryPath);
  const db = registryDatabase.getConnection();

  // Initialize file registry with shared database connection
  const fileRegistry = new SqliteFileRegistry(parentLogger, db);
  parentLogger.debug(cliLogMessages.registryInitialized(registryPath));

  // Initialize tool installation registry with shared database connection
  const toolInstallationRegistry = new SqliteToolInstallationRegistry(parentLogger, db);

  // Initialize services with yamlConfig
  const downloader = new Downloader(parentLogger, fs, undefined, downloadCache);

  // Initialize GitHub API cache using generic FileCache with JSON strategy
  const githubApiCache = new FileCache(parentLogger, fs, {
    enabled: yamlConfig.github.cache.enabled,
    defaultTtl: yamlConfig.github.cache.ttl,
    cacheDir: path.join(yamlConfig.paths.generatedDir, 'cache', 'github-api'),
    storageStrategy: 'json',
  });
  const githubApiClient = new GitHubApiClient(parentLogger, yamlConfig, downloader, githubApiCache);

  const cargoCratesIoCache = new FileCache(parentLogger, fs, {
    enabled: yamlConfig.cargo.cratesIo.cache.enabled,
    defaultTtl: yamlConfig.cargo.cratesIo.cache.ttl,
    cacheDir: path.join(yamlConfig.paths.generatedDir, 'cache', 'cargo', 'crates-io'),
    storageStrategy: 'json',
  });
  const cargoGithubRawCache = new FileCache(parentLogger, fs, {
    enabled: yamlConfig.cargo.githubRaw.cache.enabled,
    defaultTtl: yamlConfig.cargo.githubRaw.cache.ttl,
    cacheDir: path.join(yamlConfig.paths.generatedDir, 'cache', 'cargo', 'github-raw'),
    storageStrategy: 'json',
  });
  const cargoClient = new CargoClient(parentLogger, yamlConfig, downloader, cargoCratesIoCache, cargoGithubRawCache);

  // Create tracked filesystem instances for each generator
  const { shimTrackedFs, shellInitTrackedFs, symlinkTrackedFs, installerTrackedFs } = createTrackedFileSystems(
    parentLogger,
    fs,
    fileRegistry,
    systemInfo
  );

  const shimGenerator = new ShimGenerator(parentLogger, shimTrackedFs, yamlConfig);
  const shellInitGenerator = new ShellInitGenerator(parentLogger, shellInitTrackedFs, yamlConfig);
  const symlinkGenerator = new SymlinkGenerator(parentLogger, symlinkTrackedFs, yamlConfig, systemInfo);

  const generatorOrchestrator = new GeneratorOrchestrator(
    parentLogger,
    shimGenerator,
    shellInitGenerator,
    symlinkGenerator,
    fs,
    yamlConfig,
    systemInfo
  );

  const archiveExtractor = new ArchiveExtractor(parentLogger, fs);
  const installer = new Installer(
    logger,
    installerTrackedFs,
    downloader,
    githubApiClient,
    cargoClient,
    archiveExtractor,
    yamlConfig,
    toolInstallationRegistry,
    finalSystemInfo
  );
  const versionChecker = new VersionChecker(logger, githubApiClient);

  logger.trace(cliLogMessages.servicesSetup());
  return {
    yamlConfig,
    fs,
    fileRegistry,
    toolInstallationRegistry,
    downloadCache,
    downloader,
    githubApiCache,
    cargoCratesIoCache,
    cargoGithubRawCache,
    githubApiClient,
    cargoClient,
    shimGenerator,
    shellInitGenerator,
    symlinkGenerator,
    generatorOrchestrator,
    installer,
    archiveExtractor,
    versionChecker,
    systemInfo,
  };
}

export function createProgram() {
  const program = new Command()
    .name('generator')
    .description('CLI tool for managing dotfiles and tool configurations')
    .version('0.1.0')
    .option('--config <path>', 'Path to a configuration file', '')
    .option('--dry-run', 'Simulate all operations without making changes to the file system', false)
    .option('--verbose', 'Enable detailed debug messages.', false)
    .option('--quiet', 'Suppress all informational and debug output. Errors are still displayed.', false)
    .option('--platform <platform>', `Override the detected platform (${OS_VALUES.join(', ')})`)
    .option('--arch <arch>', `Override the detected architecture (${ARCH_VALUES.join(', ')})`);

  return program;
}

export function registerAllCommands(
  parentLogger: TsLogger,
  program: GlobalProgram,
  servicesFactory: () => Promise<Services>
) {
  const logger = parentLogger.getSubLogger({ name: 'registerAllCommands' });
  registerInitCommand(logger, program, servicesFactory);
  registerInstallCommand(logger, program, servicesFactory);
  registerGenerateCommand(logger, program, servicesFactory);
  registerCleanupCommand(logger, program, servicesFactory);
  registerCheckUpdatesCommand(logger, program, servicesFactory);
  registerUpdateCommand(logger, program, servicesFactory);
  registerDetectConflictsCommand(logger, program, servicesFactory);
  registerFilesCommand(logger, program, servicesFactory);
}

export type GlobalProgram = ReturnType<typeof createProgram>;
export type GlobalProgramOptions = ReturnType<GlobalProgram['opts']>;

export async function main(argv: string[]) {
  const program = createProgram();

  // Parse options first to get quiet/verbose flags
  program.parseOptions(argv);
  const options = program.opts();

  // Create logger with appropriate level based on CLI flags
  const logLevel = getLogLevelFromFlags(options.quiet, options.verbose);
  const rootLogger = createTsLogger({ name: 'cli', minLevel: logLevel });
  const logger = rootLogger.getSubLogger({ name: 'main' });

  logger.trace(cliLogMessages.cliStarted(), 'Arguments: %o', argv);

  // Create a factory function that will initialize services only when needed
  const servicesFactory = async () => {
    return await setupServices(logger, {
      ...options,
      cwd: process.cwd(),
      env: process.env,
    });
  };

  registerAllCommands(logger, program, servicesFactory);
  await program.parseAsync(argv);
}

// Only run main if the script is executed directly
if (import.meta.main) {
  main(process.argv).catch((error) => {
    // Create a basic logger for fatal errors only, since we don't have parsed options yet
    const fatalLogger = createTsLogger({ name: 'cli', minLevel: 5 }); // FATAL level only
    fatalLogger.fatal(cliLogMessages.commandExecutionFailed('main', 1, 'Top-level unhandled error'), '%O', error);
    process.exit(1);
  });
}
