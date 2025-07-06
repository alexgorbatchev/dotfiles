#!/usr/bin/env bun

/**
 * @file cli.ts
 * @description Main CLI entry point for the dotfiles management application.
 *
 * ## Development Plan
 * - [x] Define `Services` interface.
 * - [x] Add global --config <path> option.
 *   - [x] Define option in commander.
 *   - [x] Log provided path using clientLogger.info() via an 'option:config' hook.
 * - [x] Implement `setupServices` function:
 *   - [x] Initialize `AppConfig`.
 *   - [x] Initialize `IFileSystem` (NodeFileSystem or MemFileSystem based on `dryRun`).
 *     - [x] If `dryRun`, pre-populate `MemFileSystem` with tool configs from actual disk.
 *   - [x] Initialize `Downloader` with `NodeFetchStrategy`.
 *   - [x] Initialize `FileGitHubApiCache`.
 *   - [x] Initialize `GitHubApiClient`.
 *   - [x] Initialize `ShimGenerator`, `ShellInitGenerator`, `SymlinkGenerator`.
 *   - [x] Initialize `GeneratorOrchestrator`.
 *   - [x] Initialize `ArchiveExtractor`.
 *   - [x] Initialize `Installer`.
 *   - [x] Initialize `VersionChecker`.
 * - [x] Define main `program` (Commander instance).
 * - [x] Implement `registerAllCommands` function:
 *   - [x] Call `setupServices` once initially.
 *   - [x] Register all commands (`generate`, `install`, `cleanup`, `check-updates`, `update`, `detect-conflicts`).
 *     - [x] Refactor calls to `register...Command` functions to pass only `programInstance`.
 *     - [x] Update `cleanupCommand` to use `setupServices` in its action handler rather than receiving dependencies directly.
 * - [x] Implement `main` function to orchestrate command registration and parsing.
 *   - [x] Add error handling for `main` execution.
 * - [x] Ensure script runs `main` only if executed directly (`import.meta.main`).
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [x] Ensure 100% test coverage for executable code (covered by `cli.test.ts`).
 * - [x] Update `setupServices` to accept an `env` parameter and pass it to `createAppConfig`.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import { exitCli, registerCheckUpdatesCommand, registerCleanupCommand, registerDetectConflictsCommand, registerGenerateCommand, registerInstallCommand, registerUpdateCommand } from '@modules/cli';
import { createAppConfig, type AppConfig, type SystemInfo as ConfigModuleSystemInfo } from '@modules/config';
import { Downloader, NodeFetchStrategy, type IDownloader } from '@modules/downloader';
import { ArchiveExtractor, type IArchiveExtractor } from '@modules/extractor';
import { MemFileSystem, NodeFileSystem, type DirectoryJSON, type IFileSystem } from '@modules/file-system';
import { GeneratorOrchestrator, type IGeneratorOrchestrator, } from '@modules/generator-orchestrator';
import { ShellInitGenerator, type IShellInitGenerator } from '@modules/generator-shell-init';
import { ShimGenerator, type IShimGenerator } from '@modules/generator-shim';
import { SymlinkGenerator, type ISymlinkGenerator } from '@modules/generator-symlink';
import { FileGitHubApiCache, GitHubApiClient, type IGitHubApiCache, type IGitHubApiClient } from '@modules/github-client';
import { Installer, type IInstaller } from '@modules/installer';
import { createClientLogger, createLogger } from '@modules/logger';
import { VersionChecker, type IVersionChecker } from '@modules/version-checker';
import { Command } from 'commander';
import os from 'node:os';
import path from 'node:path';

const internalLog = createLogger('cli'); 

export interface Services {
  appConfig: AppConfig;
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

export async function setupServices(options: { dryRun?: boolean; env?: NodeJS.ProcessEnv } = {}): Promise<Services> {
  internalLog('setupServices: Initializing services... options: %o', options);
  const { dryRun = false, env = process.env } = options;
  const systemInfoForConfig: ConfigModuleSystemInfo = {
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
          realToolConfigsDir
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
                readError
              );
              // Optionally, decide whether to throw or continue. For now, logging and continuing.
            }
          }
        }
      } else {
        internalLog(
          'setupServices: Tool configs directory %s does not exist on the real file system.',
          realToolConfigsDir
        );
      }
    } catch (dirError) {
      internalLog(
        'setupServices: Error accessing tool configs directory %s for dry run: %O',
        realToolConfigsDir,
        dirError
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
    appConfig 
  );

  const archiveExtractor = new ArchiveExtractor(fs); 
  const installer = new Installer(fs, downloader, githubApiClient, archiveExtractor, appConfig); 
  const versionChecker = new VersionChecker(githubApiClient);

  internalLog('setupServices: Services initialized.');
  return {
    appConfig,
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

export async function registerAllCommands(programInstance: Command) {
  // Each command will call setupServices in its own action handler
  registerInstallCommand(programInstance);
  registerGenerateCommand(programInstance);
  registerCleanupCommand(programInstance);
  registerCheckUpdatesCommand(programInstance);
  registerUpdateCommand(programInstance);
  registerDetectConflictsCommand(programInstance);
}

export async function main(argv: string[]) {
    const program = new Command(); 

    program
      .name('generator')
      .description('CLI tool for managing dotfiles and tool configurations')
      .version('0.1.0')
      .option('--config <path>', 'Path to a configuration file', undefined);

    program.on('option:config', function (this: Command, configValue: string | undefined) {
      if (configValue) {
        const globalOpts = this.opts();
        const hookLogger = createClientLogger({
          verbose: globalOpts['verbose'] as boolean | undefined,
          quiet: globalOpts['quiet'] as boolean | undefined,
        });
        hookLogger.info(`Config file path: ${configValue}`);
      }
    });

    await registerAllCommands(program);
    await program.parseAsync(argv);
}

// Only run main if the script is executed directly
if (import.meta.main) {
  main(process.argv).catch((error) => {
    internalLog('main: Top-level unhandled error in main().catch(): %O', error);
    exitCli(1);
  });
}
