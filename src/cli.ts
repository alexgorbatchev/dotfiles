#!/usr/bin/env bun

import {
  registerCheckUpdatesCommand,
  registerCleanupCommand,
  registerDetectConflictsCommand,
  registerGenerateCommand,
  registerInstallCommand,
  registerUpdateCommand,
} from '@modules/cli';
import {
  createAppConfig,
  type AppConfig,
  type YamlConfig,
  type SystemInfo,
} from '@modules/config';
import { createYamlConfigFromFileSystem } from '@modules/config-loader';
import { Downloader, NodeFetchStrategy, type IDownloader } from '@modules/downloader';
import { ArchiveExtractor, type IArchiveExtractor } from '@modules/extractor';
import {
  MemFileSystem,
  NodeFileSystem,
  type DirectoryJSON,
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
import { createClientLogger, createLogger } from '@modules/logger';
import { VersionChecker, type IVersionChecker } from '@modules/version-checker';
import { Command } from 'commander';
import os from 'node:os';
import path from 'node:path';

const internalLog = createLogger('cli');
export interface Services {
  appConfig: AppConfig;
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

export async function setupServices(
  options: { dryRun?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<Services> {
  internalLog('setupServices: Initializing services... options: %o', options);
  const { dryRun = false, env = process.env } = options;
  const systemInfoForConfig: SystemInfo = {
    homedir: os.homedir(),
    cwd: process.cwd(),
  };
  const appConfig = createAppConfig(systemInfoForConfig, env as any);
  let fs: IFileSystem;

  if (dryRun) {
    internalLog('setupServices: Dry run enabled. Initializing MemFileSystem with tool configs.');
    const realToolConfigsDir = appConfig.toolConfigsDir;
    const nodeFs = new NodeFileSystem();
    const toolFilesJson: DirectoryJSON = {}; // DirectoryJSON is now imported

    try {
      if (await nodeFs.exists(realToolConfigsDir)) {
        internalLog(
          'setupServices: Reading tool configs from actual directory: %s',
          realToolConfigsDir,
        );
        const filesInDir = await nodeFs.readdir(realToolConfigsDir);
        for (const fileName of filesInDir) {
          if (fileName.endsWith('.tool.ts')) {
            const filePath = path.join(realToolConfigsDir, fileName);
            try {
              const content = await nodeFs.readFile(filePath, 'utf8');
              toolFilesJson[filePath] = content;
              internalLog('setupServices: Added tool config %s to MemFileSystem.', filePath);
            } catch (readError) {
              internalLog(
                'setupServices: Error reading tool file %s for dry run: %O',
                filePath,
                readError,
              );
              // Optionally, decide whether to throw or continue. For now, logging and continuing.
            }
          }
        }
      } else {
        internalLog(
          'setupServices: Tool configs directory %s does not exist on the real file system.',
          realToolConfigsDir,
        );
      }
    } catch (dirError) {
      internalLog(
        'setupServices: Error accessing tool configs directory %s for dry run: %O',
        realToolConfigsDir,
        dirError,
      );
      // Optionally, decide whether to throw or continue.
    }
    fs = new MemFileSystem(toolFilesJson);
  } else {
    fs = new NodeFileSystem();
  }

  internalLog('setupServices: Using IFileSystem implementation: %s', fs.constructor.name);
  const downloader = new Downloader(fs);
  downloader.registerStrategy(new NodeFetchStrategy(fs));

  // Corrected FileGitHubApiCache instantiation
  const githubApiCache = new FileGitHubApiCache(fs, appConfig);

  // Corrected GitHubApiClient instantiation
  const githubApiClient = new GitHubApiClient(appConfig, downloader, githubApiCache);

  // Corrected Generator instantiations
  const shimGenerator = new ShimGenerator(fs, appConfig);
  const shellInitGenerator = new ShellInitGenerator(fs, appConfig);
  const symlinkGenerator = new SymlinkGenerator(fs, appConfig);

  // Corrected GeneratorOrchestrator instantiation
  const generatorOrchestrator = new GeneratorOrchestrator(
    shimGenerator,
    shellInitGenerator,
    symlinkGenerator,
    fs,
    appConfig,
  );

  const archiveExtractor = new ArchiveExtractor(fs);
  const installer = new Installer(fs, downloader, githubApiClient, archiveExtractor, appConfig);
  const versionChecker = new VersionChecker(githubApiClient);

  // Initialize yamlConfig
  const systemInfoForYamlConfig = {
    platform: process.platform,
    arch: process.arch,
    homeDir: os.homedir(),
  };
  
  const configPath = path.join(appConfig.dotfilesDir, 'config.yaml');
  internalLog('setupServices: Loading YAML config from %s', configPath);
  const yamlConfig = await createYamlConfigFromFileSystem(fs, configPath, systemInfoForYamlConfig, env);
  
  internalLog('setupServices: Services initialized.');
  return {
    appConfig,
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
      false,
    );

  return program;
}

export function registerAllCommands(program: GlobalProgram, services: Services) {
  registerInstallCommand(program, services);
  registerGenerateCommand(program, services);
  registerCleanupCommand(program, services);
  registerCheckUpdatesCommand(program, services);
  registerUpdateCommand(program, services);
  registerDetectConflictsCommand(program, services);
}

export type GlobalProgram = ReturnType<typeof createProgram>;

export async function main(argv: string[]) {
  const program = createProgram();

  program.on('option:config', function (this: Command, configValue: string | undefined) {
    if (configValue) {
      const globalOpts = this.opts() as { verbose?: boolean; quiet?: boolean };
      const hookLogger = createClientLogger({
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
      });
      hookLogger.info(`Config file path: ${configValue}`);
    }
  });

  // Parse initial options to determine dry-run status for service setup
  program.parseOptions(argv);
  const options = program.opts() as { dryRun?: boolean };

  const services = await setupServices({ dryRun: options.dryRun });

  registerAllCommands(program, services);
  await program.parseAsync(argv);
}

// Only run main if the script is executed directly
if (import.meta.main) {
  main(process.argv).catch((error) => {
    internalLog('main: Top-level unhandled error in main().catch(): %O', error);
    process.exit(1);
  });
}
