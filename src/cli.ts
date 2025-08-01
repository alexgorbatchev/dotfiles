#!/usr/bin/env bun

import {
  registerCheckUpdatesCommand,
  registerCleanupCommand,
  registerDetectConflictsCommand,
  registerGenerateCommand,
  registerInstallCommand,
  registerUpdateCommand,
} from '@modules/cli';
import { type YamlConfig } from '@modules/config';
import { loadYamlConfig } from '@modules/config-loader';
import { Downloader, NodeFetchStrategy, type IDownloader } from '@modules/downloader';
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
  FileGitHubApiCache,
  GitHubApiClient,
  type IGitHubApiCache,
  type IGitHubApiClient,
} from '@modules/github-client';
import { Installer, type IInstaller } from '@modules/installer';
import { type TsLogger, createTsLogger } from '@modules/logger';
import { VersionChecker, type IVersionChecker } from '@modules/version-checker';
import type { SystemInfo } from '@types';
import { Command } from 'commander';
import os from 'node:os';
import path from 'node:path';
import { ErrorTemplates, WarningTemplates } from '@modules/shared/ErrorTemplates';

export interface Services {
  yamlConfig: YamlConfig;
  fs: IFileSystem;
  downloader: IDownloader;
  githubApiCache: IGitHubApiCache;
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
    platform: process.platform,
    arch: process.arch,
    homeDir: os.homedir(),
  };

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

  // Initialize services with yamlConfig
  const downloader = new Downloader(parentLogger, fs);
  downloader.registerStrategy(new NodeFetchStrategy(parentLogger, fs));

  const githubApiCache = new FileGitHubApiCache(parentLogger, fs, yamlConfig);
  const githubApiClient = new GitHubApiClient(parentLogger, yamlConfig, downloader, githubApiCache);

  const shimGenerator = new ShimGenerator(parentLogger, fs, yamlConfig);
  const shellInitGenerator = new ShellInitGenerator(parentLogger, fs, yamlConfig);
  const symlinkGenerator = new SymlinkGenerator(parentLogger, fs, yamlConfig);

  const generatorOrchestrator = new GeneratorOrchestrator(
    parentLogger,
    shimGenerator,
    shellInitGenerator,
    symlinkGenerator,
    fs,
    yamlConfig
  );

  const archiveExtractor = new ArchiveExtractor(parentLogger, fs);
  const installer = new Installer(
    logger,
    fs,
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
    );

  return program;
}

export function registerAllCommands(parentLogger: TsLogger, program: GlobalProgram, services: Services) {
  const logger = parentLogger.getSubLogger({ name: 'registerAllCommands' });
  registerInstallCommand(logger, program, services);
  registerGenerateCommand(logger, program, services);
  registerCleanupCommand(logger, program, services);
  registerCheckUpdatesCommand(logger, program, services);
  registerUpdateCommand(logger, program, services);
  registerDetectConflictsCommand(logger, program, services);
}

export type GlobalProgram = ReturnType<typeof createProgram>;
export type GlobalProgramOptions = ReturnType<GlobalProgram['opts']>;

export async function main(parentLogger: TsLogger, argv: string[]) {
  const logger = parentLogger.getSubLogger({ name: 'main' });
  const program = createProgram();

  logger.trace('CLI starting with arguments:', argv);

  program.parseOptions(argv);

  const services = await setupServices(logger, {
    ...program.opts(),
    cwd: process.cwd(),
    env: process.env,
  });

  registerAllCommands(logger, program, services);
  await program.parseAsync(argv);
}

// Only run main if the script is executed directly
if (import.meta.main) {
  const rootLogger = createTsLogger('cli');
  main(rootLogger, process.argv).catch((error) => {
    rootLogger.fatal('Top-level unhandled error in main().catch(): %O', error);
    process.exit(1);
  });
}
