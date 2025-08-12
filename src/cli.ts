#!/usr/bin/env bun

import {
  registerCheckUpdatesCommand,
  registerCleanupCommand,
  registerDetectConflictsCommand,
  registerFilesCommand,
  registerGenerateCommand,
  registerInstallCommand,
  registerUpdateCommand,
} from '@modules/cli';
import { type YamlConfig, OS_VALUES, ARCH_VALUES } from '@modules/config';
import { loadYamlConfig } from '@modules/config-loader';
import { FileCache, type ICache } from '@modules/cache';
import { Downloader, type IDownloader } from '@modules/downloader';
import { ArchiveExtractor, type IArchiveExtractor } from '@modules/extractor';
import {
  MemFileSystem,
  NodeFileSystem,
  type IFileSystem,
} from '@modules/file-system';
import {
  GeneratorOrchestrator,
  type IGeneratorOrchestrator,
} from '@modules/generator-orchestrator';
import { ShellInitGenerator, type IShellInitGenerator } from '@modules/generator-shell-init';
import { ShimGenerator, type IShimGenerator } from '@modules/generator-shim';
import { SymlinkGenerator, type ISymlinkGenerator } from '@modules/generator-symlink';
import {
  GitHubApiClient,
  type IGitHubApiClient,
} from '@modules/github-client';
import { Installer, type IInstaller } from '@modules/installer';
import { type TsLogger, createTsLogger, getLogLevelFromFlags } from '@modules/logger';
import { SqliteFileRegistry, type IFileRegistry, TrackedFileSystem } from '@modules/file-registry';
import { VersionChecker, type IVersionChecker } from '@modules/version-checker';
import type { SystemInfo } from '@types';
import { contractHomePath } from '@utils';
import { Command } from 'commander';
import os from 'node:os';
import path from 'node:path';
import { logs } from '@modules/logger';

export interface Services {
  yamlConfig: YamlConfig;
  fs: IFileSystem;
  fileRegistry: IFileRegistry;
  downloadCache: ICache | undefined;
  downloader: IDownloader;
  githubApiCache: ICache;
  githubApiClient: IGitHubApiClient;
  shimGenerator: IShimGenerator;
  shellInitGenerator: IShellInitGenerator;
  symlinkGenerator: ISymlinkGenerator;
  generatorOrchestrator: IGeneratorOrchestrator;
  installer: IInstaller;
  archiveExtractor: IArchiveExtractor;
  versionChecker: IVersionChecker;
}

type SetupServicesOptions = GlobalProgramOptions & {
 cwd: string; 
 env: NodeJS.ProcessEnv;
}

export async function setupServices(
  parentLogger: TsLogger,
  options: SetupServicesOptions
): Promise<Services> {
  const logger = parentLogger.getSubLogger({ name: 'setupServices' });
  logger.trace(logs.general.success.started('setupServices'), options);
  const { dryRun, env, config } = options;

  // Initialize filesystem first
  let fs: IFileSystem;
  if (dryRun) {
    logger.trace(logs.general.success.dryRunEnabled());
    fs = new MemFileSystem({});
  } else {
    fs = new NodeFileSystem();
  }

  logger.trace(logs.general.success.initialized('filesystem'), fs.constructor.name);

  const systemInfo: SystemInfo = {
    platform: options.platform || process.platform,
    arch: options.arch || process.arch,
    homeDir: os.homedir(),
  };

  if (options.platform) {
    logger.warn(logs.config.warning.overridden('platform', options.platform));
  }
  if (options.arch) {
    logger.warn(logs.config.warning.overridden('arch', options.arch));
  }

  // Default config path should be in the generator directory
  // If no config specified, look for config.yaml in the generator directory (one level up from src/)
  const userConfigPath = config.length === 0 ? 
    path.resolve(path.dirname(__dirname), 'config.yaml') : 
    config;
  
  // For config loading, use NodeFileSystem only in dry-run mode when running the CLI directly
  // In tests, the config file should be loaded from the test filesystem (MemFileSystem)
  const isRunningDirectly = process.env.NODE_ENV !== 'test' && !process.env['BUN_TEST'];
  const configFs = (dryRun && isRunningDirectly) ? new NodeFileSystem() : fs;
  const yamlConfig = await loadYamlConfig(logger, configFs, userConfigPath, systemInfo, env);

  // console.log('yamlConfig', yamlConfig);

  // If dry run, load tool configs into memory filesystem
  if (dryRun) {
    logger.trace(logs.general.success.toolConfigsForDryRun());
    const realToolConfigsDir = yamlConfig.paths.toolConfigsDir;
    const nodeFs = new NodeFileSystem();

    try {
      if (await nodeFs.exists(realToolConfigsDir)) {
        logger.trace(logs.config.success.loaded(realToolConfigsDir, 0));
        const filesInDir = await nodeFs.readdir(realToolConfigsDir);

        for (const fileName of filesInDir) {
          if (fileName.endsWith('.tool.ts')) {
            const filePath = path.join(realToolConfigsDir, fileName);
            try {
              const content = await nodeFs.readFile(filePath, 'utf8');
              await fs.ensureDir(realToolConfigsDir);
              await fs.writeFile(filePath, content);
              logger.trace(logs.fs.success.created('memfs', contractHomePath(systemInfo.homeDir, filePath)));
            } catch (readError: any) {
              logger.warn(logs.fs.warning.readFailed(filePath, readError.message));
              logger.error(logs.fs.error.readFailed(filePath, String(readError)), readError);
              // Optionally, decide whether to throw or continue. For now, logging and continuing.
            }
          }
        }
      } else {
        logger.warn(logs.fs.warning.notFound('Tool configs directory', realToolConfigsDir));
      }
    } catch (error) {
      logger.error(logs.fs.error.accessDenied('accessing', realToolConfigsDir));
      // Optionally, decide whether to throw or continue.
    }
  }

  // Initialize download cache if enabled
  let downloadCache: ICache | undefined;
  if (yamlConfig.downloader.cache.enabled) {
    const cacheDir = path.join(yamlConfig.paths.generatedDir, 'cache', 'downloads');
    downloadCache = new FileCache(
      parentLogger,
      fs,
      {
        enabled: true,
        defaultTtl: yamlConfig.downloader.cache.ttl,
        cacheDir,
        storageStrategy: 'binary',
      }
    );
    parentLogger.debug(logs.general.success.cachingEnabled(), `Directory: ${cacheDir} (TTL: ${yamlConfig.downloader.cache.ttl / 1000 / 60 / 60} hours)`);
  } else {
    parentLogger.info(logs.general.success.cachingDisabled());
  }

  // Initialize file registry
  const registryPath = path.join(yamlConfig.paths.generatedDir, 'registry.db');
  const fileRegistry = new SqliteFileRegistry(parentLogger, registryPath);
  parentLogger.debug(logs.registry.success.initialized(registryPath));

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

  // Create tracked filesystem instances for each generator
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

  // Create tracked filesystem for installer binary operations  
  const installerTrackedFs = new TrackedFileSystem(
    parentLogger,
    fs,
    fileRegistry,
    TrackedFileSystem.createContext('system', 'binary'),
    systemInfo.homeDir
  );

  const archiveExtractor = new ArchiveExtractor(parentLogger, fs);
  const installer = new Installer(
    logger,
    installerTrackedFs,
    downloader,
    githubApiClient,
    archiveExtractor,
    yamlConfig,
  );
  const versionChecker = new VersionChecker(logger, githubApiClient);

  logger.trace(logs.general.success.servicesSetup());
  return {
    yamlConfig,
    fs,
    fileRegistry,
    downloadCache,
    downloader,
    githubApiCache,
    githubApiClient,
    shimGenerator,
    shellInitGenerator,
    symlinkGenerator,
    generatorOrchestrator,
    installer,
    archiveExtractor,
    versionChecker,
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
    .option(
      '--quiet',
      'Suppress all informational and debug output. Errors are still displayed.',
      false
    )
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

  logger.trace(logs.general.success.cliStarted(), 'Arguments: %o', argv);

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
    fatalLogger.fatal(logs.command.error.executionFailed('main', 1, 'Top-level unhandled error'), '%O', error);
    process.exit(1);
  });
}
