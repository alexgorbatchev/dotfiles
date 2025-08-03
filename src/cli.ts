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
import { Command } from 'commander';
import os from 'node:os';
import path from 'node:path';
import { ErrorTemplates, WarningTemplates, SuccessTemplates } from '@modules/shared/ErrorTemplates';

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
  logger.trace('options=%o', options);
  const { dryRun, env, config } = options;

  // Initialize filesystem first
  let fs: IFileSystem;
  if (dryRun) {
    logger.trace('Dry run enabled. Initializing MemFileSystem.');
    fs = new MemFileSystem({});
  } else {
    fs = new NodeFileSystem();
  }

  logger.trace('Using IFileSystem implementation: %s', fs.constructor.name);

  const systemInfo: SystemInfo = {
    platform: options.platform || process.platform,
    arch: options.arch || process.arch,
    homeDir: os.homedir(),
  };

  if (options.platform) {
    logger.warn(`Platform overridden to: ${options.platform}`);
  }
  if (options.arch) {
    logger.warn(`Architecture overridden to: ${options.arch}`);
  }

  const userConfigPath = config.length === 0 ? path.resolve(options.cwd, 'config.yaml') : config;
  const yamlConfig = await loadYamlConfig(logger, fs, userConfigPath, systemInfo, env);

  // console.log('yamlConfig', yamlConfig);

  // If dry run, load tool configs into memory filesystem
  if (dryRun) {
    logger.trace('Loading tool configs into MemFileSystem for dry run.');
    const realToolConfigsDir = yamlConfig.paths.toolConfigsDir;
    const nodeFs = new NodeFileSystem();

    try {
      if (await nodeFs.exists(realToolConfigsDir)) {
        logger.trace('Reading tool configs from actual directory: %s', realToolConfigsDir);
        const filesInDir = await nodeFs.readdir(realToolConfigsDir);

        for (const fileName of filesInDir) {
          if (fileName.endsWith('.tool.ts')) {
            const filePath = path.join(realToolConfigsDir, fileName);
            try {
              const content = await nodeFs.readFile(filePath, 'utf8');
              await fs.ensureDir(realToolConfigsDir);
              await fs.writeFile(filePath, content);
              logger.trace('Added tool config %s to MemFileSystem.', filePath);
            } catch (readError: any) {
              logger.warn(WarningTemplates.fs.readFailed(filePath, readError.message));
              logger.debug('Tool file read error details: %O', readError);
              // Optionally, decide whether to throw or continue. For now, logging and continuing.
            }
          }
        }
      } else {
        logger.warn(WarningTemplates.fs.notFound('Tool configs directory', realToolConfigsDir));
      }
    } catch (error) {
      logger.error(ErrorTemplates.fs.accessDenied('accessing', realToolConfigsDir));
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
    parentLogger.info('Download cache enabled: %s (TTL: %d ms)', cacheDir, yamlConfig.downloader.cache.ttl);
  } else {
    parentLogger.info('Download cache disabled');
  }

  // Initialize file registry
  const registryPath = path.join(yamlConfig.paths.generatedDir, 'registry.db');
  const fileRegistry = new SqliteFileRegistry(parentLogger, registryPath);
  parentLogger.debug(SuccessTemplates.registry.initialized(registryPath));

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
    TrackedFileSystem.createContext('system', 'shim')
  );
  const shellInitTrackedFs = new TrackedFileSystem(
    parentLogger,
    fs,
    fileRegistry,
    TrackedFileSystem.createContext('system', 'init')
  );
  const symlinkTrackedFs = new TrackedFileSystem(
    parentLogger,
    fs,
    fileRegistry,
    TrackedFileSystem.createContext('system', 'symlink')
  );

  const shimGenerator = new ShimGenerator(parentLogger, shimTrackedFs, yamlConfig);
  const shellInitGenerator = new ShellInitGenerator(parentLogger, shellInitTrackedFs, yamlConfig);
  const symlinkGenerator = new SymlinkGenerator(parentLogger, symlinkTrackedFs, yamlConfig);

  const generatorOrchestrator = new GeneratorOrchestrator(
    parentLogger,
    shimGenerator,
    shellInitGenerator,
    symlinkGenerator,
    fs,
    yamlConfig
  );

  // Create tracked filesystem for installer binary operations  
  const installerTrackedFs = new TrackedFileSystem(
    parentLogger,
    fs,
    fileRegistry,
    TrackedFileSystem.createContext('system', 'binary')
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

  logger.trace('Services initialized.');
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

  logger.trace('CLI starting with arguments:', argv);

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
    fatalLogger.fatal('Top-level unhandled error in main().catch(): %O', error);
    process.exit(1);
  });
}
