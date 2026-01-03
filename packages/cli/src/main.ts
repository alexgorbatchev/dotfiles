#!/usr/bin/env bun

import os from 'node:os';
import path from 'node:path';
import { ArchiveExtractor } from '@dotfiles/archive-extractor';
import { ConfigService, loadConfig, type ProjectConfig } from '@dotfiles/config';
import type { ISystemInfo } from '@dotfiles/core';
import { architectureFromNodeJS, InstallerPluginRegistry, platformFromNodeJS } from '@dotfiles/core';
import { Downloader, FileCache, type ICache } from '@dotfiles/downloader';
import { ReadmeService } from '@dotfiles/features';
import { type IFileSystem, MemFileSystem, NodeFileSystem, ResolvedFileSystem } from '@dotfiles/file-system';
import { GeneratorOrchestrator } from '@dotfiles/generator-orchestrator';
import { HookExecutor, Installer } from '@dotfiles/installer';
import { BrewInstallerPlugin } from '@dotfiles/installer-brew';
import { CargoClient, CargoInstallerPlugin } from '@dotfiles/installer-cargo';
import { CurlScriptInstallerPlugin } from '@dotfiles/installer-curl-script';
import { CurlTarInstallerPlugin } from '@dotfiles/installer-curl-tar';
import { GitHubApiClient, GitHubReleaseInstallerPlugin } from '@dotfiles/installer-github';
import { ManualInstallerPlugin } from '@dotfiles/installer-manual';
import { createTsLogger, getLogLevelFromFlags, type LogLevelValue, type TsLogger } from '@dotfiles/logger';
import { FileRegistry, type IFileRegistry, TrackedFileSystem } from '@dotfiles/registry/file';
import { ToolInstallationRegistry } from '@dotfiles/registry/tool';
import { RegistryDatabase } from '@dotfiles/registry-database';
import { CompletionCommandExecutor, CompletionGenerator, ShellInitGenerator } from '@dotfiles/shell-init-generator';
import { ShimGenerator } from '@dotfiles/shim-generator';
import { SymlinkGenerator } from '@dotfiles/symlink-generator';
import { contractHomePath } from '@dotfiles/utils';
import { VersionChecker } from '@dotfiles/version-checker';
import { $ } from 'bun';

import { registerCheckUpdatesCommand } from './checkUpdatesCommand';
import { registerCleanupCommand } from './cleanupCommand';
import { createProgram } from './createProgram';
import { registerDetectConflictsCommand } from './detectConflictsCommand';
import { registerDocsCommand } from './docsCommand';
import { registerFeaturesCommand } from './featuresCommand';
import { registerFilesCommand } from './filesCommand';
import { registerGenerateCommand } from './generateCommand';
import { registerInstallCommand } from './installCommand';
import { messages } from './log-messages';
import { registerLogCommand } from './logCommand';
import { DEFAULT_CONFIG_FILES, resolveConfigPath } from './resolveConfigPath';
import type { IGlobalProgram, IGlobalProgramOptions, IServices } from './types';
import { registerUpdateCommand } from './updateCommand';

type SetupServicesOptions = IGlobalProgramOptions & {
  cwd: string;
  env: NodeJS.ProcessEnv;
};

function initializeFileSystem(logger: TsLogger, dryRun: boolean): IFileSystem {
  let fs: IFileSystem;
  if (dryRun) {
    logger.trace(messages.dryRunEnabled());
    fs = new MemFileSystem({});
  } else {
    fs = new NodeFileSystem();
  }
  logger.trace(messages.componentInitialized('filesystem'), fs.constructor.name);
  return fs;
}

function createSystemInfo(options: SetupServicesOptions, logger: TsLogger): ISystemInfo {
  // CLI options are user-provided strings that override process.platform/arch for testing
  const platformString: NodeJS.Platform = (options.platform as NodeJS.Platform) || process.platform;
  const archString: NodeJS.Architecture = (options.arch as NodeJS.Architecture) || process.arch;

  const systemInfo: ISystemInfo = {
    platform: platformFromNodeJS(platformString),
    arch: architectureFromNodeJS(archString),
    homeDir: os.homedir(),
  };

  if (options.platform) {
    logger.warn(messages.configParameterOverridden('platform', options.platform));
  }
  if (options.arch) {
    logger.warn(messages.configParameterOverridden('arch', options.arch));
  }

  return systemInfo;
}

async function copyToolConfigFile(
  logger: TsLogger,
  fs: IFileSystem,
  nodeFs: NodeFileSystem,
  filePath: string,
  systemInfo: ISystemInfo
): Promise<void> {
  try {
    const content = await nodeFs.readFile(filePath, 'utf8');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content);
    logger.trace(messages.fsWrite('memfs', contractHomePath(systemInfo.homeDir, filePath)));
  } catch (readError: unknown) {
    logger.error(messages.fsReadFailed(filePath), readError);
  }
}

async function loadToolConfigsForDryRun(
  logger: TsLogger,
  fs: IFileSystem,
  projectConfig: ProjectConfig,
  systemInfo: ISystemInfo
): Promise<void> {
  logger.trace(messages.toolConfigsForDryRun());
  const realToolConfigsDir = projectConfig.paths.toolConfigsDir;
  const nodeFs = new NodeFileSystem();

  try {
    if (!(await nodeFs.exists(realToolConfigsDir))) {
      logger.warn(messages.fsItemNotFound('Tool configs directory', realToolConfigsDir));
      return;
    }

    logger.trace(messages.toolConfigsLoaded(realToolConfigsDir, 0));
    const filesInDir = await nodeFs.readdir(realToolConfigsDir);

    for (const fileName of filesInDir) {
      if (fileName.endsWith('.tool.ts')) {
        const filePath = path.join(realToolConfigsDir, fileName);
        await copyToolConfigFile(logger, fs, nodeFs, filePath, systemInfo);
      }
    }
  } catch (_error) {
    logger.error(messages.fsAccessDenied('accessing', realToolConfigsDir));
  }
}

function initializeDownloadCache(
  parentLogger: TsLogger,
  fs: IFileSystem,
  projectConfig: ProjectConfig
): ICache | undefined {
  if (!projectConfig.downloader.cache.enabled) {
    parentLogger.info(messages.cachingDisabled());
    return undefined;
  }

  const cacheDir = path.join(projectConfig.paths.generatedDir, 'cache', 'downloads');
  const downloadCache = new FileCache(parentLogger, fs, {
    enabled: true,
    defaultTtl: projectConfig.downloader.cache.ttl,
    cacheDir,
    storageStrategy: 'binary',
  });

  return downloadCache;
}

function createTrackedFileSystems(
  parentLogger: TsLogger,
  fs: IFileSystem,
  fileRegistry: IFileRegistry,
  projectConfig: ProjectConfig
): {
  shimTrackedFs: TrackedFileSystem;
  shellInitTrackedFs: TrackedFileSystem;
  symlinkTrackedFs: TrackedFileSystem;
  installerTrackedFs: TrackedFileSystem;
  catalogTrackedFs: TrackedFileSystem;
  completionTrackedFs: TrackedFileSystem;
} {
  const shimTrackedFs = new TrackedFileSystem(
    parentLogger,
    fs,
    fileRegistry,
    TrackedFileSystem.createContext('system', 'shim'),
    projectConfig
  );

  const shellInitTrackedFs = new TrackedFileSystem(
    parentLogger,
    fs,
    fileRegistry,
    TrackedFileSystem.createContext('system', 'init'),
    projectConfig
  );

  const symlinkTrackedFs = new TrackedFileSystem(
    parentLogger,
    fs,
    fileRegistry,
    TrackedFileSystem.createContext('system', 'symlink'),
    projectConfig
  );

  const installerTrackedFs = new TrackedFileSystem(
    parentLogger,
    fs,
    fileRegistry,
    TrackedFileSystem.createContext('system', 'binary'),
    projectConfig
  );

  const catalogTrackedFs = new TrackedFileSystem(
    parentLogger,
    fs,
    fileRegistry,
    TrackedFileSystem.createContext('system', 'catalog'),
    projectConfig
  );

  const completionTrackedFs = new TrackedFileSystem(
    parentLogger,
    fs,
    fileRegistry,
    TrackedFileSystem.createContext('system', 'completion'),
    projectConfig
  );

  return {
    shimTrackedFs,
    shellInitTrackedFs,
    symlinkTrackedFs,
    installerTrackedFs,
    catalogTrackedFs,
    completionTrackedFs,
  };
}

export async function setupServices(parentLogger: TsLogger, options: SetupServicesOptions): Promise<IServices> {
  const logger = parentLogger.getSubLogger({ name: 'setupServices' });
  const { dryRun, env, config } = options;

  // Initialize filesystem first
  const fs = initializeFileSystem(logger, dryRun);
  const systemInfo = createSystemInfo(options, logger);

  // Resolve config path - if explicit path provided use it, otherwise search for default config files
  const userConfigPath = await resolveConfigPath(logger, config, process.cwd());

  if (!userConfigPath) {
    logger.error(messages.configNotFound(DEFAULT_CONFIG_FILES.join(', ')));
    process.exit(1);
  }

  // For config loading, use NodeFileSystem only in dry-run mode when running the CLI directly
  const isRunningDirectly = process.env.NODE_ENV !== 'test' && !process.env['BUN_TEST'];
  const configFs = dryRun && isRunningDirectly ? new NodeFileSystem() : fs;
  const projectConfig = await loadConfig(logger, configFs, userConfigPath, systemInfo, env);

  // Create final systemInfo with correct homeDir from projectConfig
  const finalSystemInfo: ISystemInfo = {
    platform: systemInfo.platform,
    arch: systemInfo.arch,
    homeDir: projectConfig.paths.homeDir,
  };

  // Wrap filesystem to resolve tilde paths using configured home
  const resolvedFs = new ResolvedFileSystem(fs, projectConfig.paths.homeDir);

  // If dry run, load tool configs into memory filesystem
  if (dryRun) {
    await loadToolConfigsForDryRun(logger, resolvedFs, projectConfig, finalSystemInfo);
  }

  // Initialize download cache if enabled
  const downloadCache = initializeDownloadCache(parentLogger, resolvedFs, projectConfig);

  // Initialize shared registry database
  const registryPath = path.join(projectConfig.paths.generatedDir, 'registry.db');
  const registryDatabase = new RegistryDatabase(parentLogger, registryPath);
  const db = registryDatabase.getConnection();

  // Create system-context logger for registry operations
  const registryLogger = parentLogger.getSubLogger({ context: 'system' });

  // Initialize file registry with shared database connection
  const fileRegistry = new FileRegistry(registryLogger, db);
  parentLogger.debug(messages.registryInitialized(registryPath));

  // Initialize tool installation registry with shared database connection
  const toolInstallationRegistry = new ToolInstallationRegistry(registryLogger, db);

  // Initialize services with projectConfig
  const downloader = new Downloader(parentLogger, resolvedFs, undefined, downloadCache);

  // Initialize GitHub API cache using generic FileCache with JSON strategy
  const githubApiCache = new FileCache(parentLogger, resolvedFs, {
    enabled: projectConfig.github.cache.enabled,
    defaultTtl: projectConfig.github.cache.ttl,
    cacheDir: path.join(projectConfig.paths.generatedDir, 'cache', 'github-api'),
    storageStrategy: 'json',
  });
  const githubApiClient = new GitHubApiClient(parentLogger, projectConfig, downloader, githubApiCache);

  const cargoCratesIoCache = new FileCache(parentLogger, resolvedFs, {
    enabled: projectConfig.cargo.cratesIo.cache.enabled,
    defaultTtl: projectConfig.cargo.cratesIo.cache.ttl,
    cacheDir: path.join(projectConfig.paths.generatedDir, 'cache', 'cargo', 'crates-io'),
    storageStrategy: 'json',
  });
  const cargoGithubRawCache = new FileCache(parentLogger, resolvedFs, {
    enabled: projectConfig.cargo.githubRaw.cache.enabled,
    defaultTtl: projectConfig.cargo.githubRaw.cache.ttl,
    cacheDir: path.join(projectConfig.paths.generatedDir, 'cache', 'cargo', 'github-raw'),
    storageStrategy: 'json',
  });
  const cargoClient = new CargoClient(parentLogger, projectConfig, downloader, cargoCratesIoCache, cargoGithubRawCache);

  // Create tracked filesystem instances for each generator
  const {
    shimTrackedFs,
    shellInitTrackedFs,
    symlinkTrackedFs,
    installerTrackedFs,
    catalogTrackedFs,
    completionTrackedFs,
  } = createTrackedFileSystems(parentLogger, resolvedFs, fileRegistry, projectConfig);

  // Create system-context logger for generators that operate at system level
  const systemLogger = parentLogger.getSubLogger({ context: 'system' });

  const shimGenerator = new ShimGenerator(systemLogger, shimTrackedFs, projectConfig);
  const shellInitGenerator = new ShellInitGenerator(systemLogger, shellInitTrackedFs, projectConfig);
  const symlinkGenerator = new SymlinkGenerator(systemLogger, symlinkTrackedFs, projectConfig, systemInfo);
  const completionCommandExecutor = new CompletionCommandExecutor(systemLogger);

  const archiveExtractor = new ArchiveExtractor(parentLogger, resolvedFs);

  const completionGenerator = new CompletionGenerator(systemLogger, completionTrackedFs, completionCommandExecutor, {
    downloader,
    archiveExtractor,
  });

  const generatorOrchestrator = new GeneratorOrchestrator(
    systemLogger,
    shimGenerator,
    shellInitGenerator,
    symlinkGenerator,
    completionGenerator,
    systemInfo,
    projectConfig,
    fileRegistry,
    resolvedFs,
    completionTrackedFs
  );

  // Initialize plugin registry
  const pluginRegistry = new InstallerPluginRegistry(parentLogger);

  // Initialize hook executor for plugins
  const hookExecutor = new HookExecutor(parentLogger, (chunk: string): void => {
    process.stdout.write(chunk);
  });

  // Register all installer plugins
  pluginRegistry.register(
    new GitHubReleaseInstallerPlugin(
      installerTrackedFs,
      downloader,
      githubApiClient,
      archiveExtractor,
      projectConfig,
      hookExecutor
    )
  );
  pluginRegistry.register(new BrewInstallerPlugin(parentLogger));
  pluginRegistry.register(
    new CargoInstallerPlugin(
      parentLogger,
      installerTrackedFs,
      downloader,
      cargoClient,
      archiveExtractor,
      hookExecutor,
      projectConfig.cargo.githubRelease.host
    )
  );
  pluginRegistry.register(new CurlScriptInstallerPlugin(parentLogger, installerTrackedFs, downloader, hookExecutor));
  pluginRegistry.register(
    new CurlTarInstallerPlugin(parentLogger, installerTrackedFs, downloader, archiveExtractor, hookExecutor)
  );
  pluginRegistry.register(new ManualInstallerPlugin(parentLogger, installerTrackedFs));

  const installer = new Installer(
    logger,
    installerTrackedFs,
    resolvedFs,
    projectConfig,
    toolInstallationRegistry,
    finalSystemInfo,
    pluginRegistry,
    symlinkGenerator,
    $,
    hookExecutor
  );
  const versionChecker = new VersionChecker(logger, githubApiClient);
  const configService = new ConfigService();
  const readmeService = new ReadmeService(
    logger,
    downloader,
    toolInstallationRegistry,
    resolvedFs,
    catalogTrackedFs,
    path.join(projectConfig.paths.generatedDir, 'cache', 'readme'),
    pluginRegistry
  );

  return {
    projectConfig,
    fs: resolvedFs,
    configService,
    readmeService,
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
    completionGenerator,
    generatorOrchestrator,
    installer,
    archiveExtractor,
    versionChecker,
    pluginRegistry,
    systemInfo,
  };
}

export function registerAllCommands(
  parentLogger: TsLogger,
  program: IGlobalProgram,
  servicesFactory: () => Promise<IServices>
) {
  const logger = parentLogger.getSubLogger({ name: 'registerAllCommands' });
  registerInstallCommand(logger, program, servicesFactory);
  registerGenerateCommand(logger, program, servicesFactory);
  registerFeaturesCommand(logger, program, servicesFactory);
  registerCleanupCommand(logger, program, servicesFactory);
  registerCheckUpdatesCommand(logger, program, servicesFactory);
  registerUpdateCommand(logger, program, servicesFactory);
  registerDetectConflictsCommand(logger, program, servicesFactory);
  registerLogCommand(logger, program, servicesFactory);
  registerFilesCommand(logger, program, servicesFactory);
  registerDocsCommand(logger, program, servicesFactory);
}

function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

export function resolveLogLevel(argv: string[], options: IGlobalProgramOptions): LogLevelValue {
  const isShimMode = hasFlag(argv, '--shim-mode');
  const quiet = options.quiet || isShimMode;
  return getLogLevelFromFlags(options.log, quiet, options.verbose);
}

export async function main(argv: string[]) {
  const program = createProgram();

  // Parse options first to get quiet/verbose flags
  program.parseOptions(argv);
  const options: IGlobalProgramOptions = program.opts();

  // Create logger with appropriate level based on CLI flags
  const logLevel = resolveLogLevel(argv, options);
  const rootLogger = createTsLogger({ name: 'cli', level: logLevel });
  const logger = rootLogger.getSubLogger({ name: 'main' });

  logger.trace(messages.cliStarted(), argv);

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
    const fatalLogger = createTsLogger({ name: 'cli' });
    fatalLogger.fatal(messages.commandExecutionFailed('main', 1), error);
    process.exit(1);
  });
}
