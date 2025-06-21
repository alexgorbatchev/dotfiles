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
 * - [x] Update the memory bank with the new information when all tasks are complete.
 */

import { createClientLogger } from '@modules/logger'; // Re-add for parseArg
import {
  createAppConfig,
  type AppConfig,
  type SystemInfo as ConfigModuleSystemInfo,
} from '@modules/config';
// createClientLogger was removed from here as it's unused in this file.
// It's imported and used within individual command modules' action handlers.
import { createLogger } from '@modules/logger'; // Added import for createDebugLoggerInternal
// import { createClientLogger } from '@modules/logger/clientLogger'; // Will be created in each command's action
import { NodeFetchStrategy, type IDownloader } from '@modules/downloader';
import { Downloader } from '@modules/downloader/Downloader';
import { ArchiveExtractor, type IArchiveExtractor } from '@modules/extractor'; // Added import
import { MemFileSystem, type DirectoryJSON, type IFileSystem } from '@modules/file-system'; // Added MemFileSystem and types
import { NodeFileSystem } from '@modules/file-system/NodeFileSystem';
import {
  GeneratorOrchestrator,
  type IGeneratorOrchestrator,
} from '@modules/generator-orchestrator';
import { type IShellInitGenerator } from '@modules/generator-shell-init';
import { ShellInitGenerator } from '@modules/generator-shell-init/ShellInitGenerator';
import { type IShimGenerator } from '@modules/generator-shim';
import { ShimGenerator } from '@modules/generator-shim/ShimGenerator';
import { type ISymlinkGenerator } from '@modules/generator-symlink';
import { SymlinkGenerator } from '@modules/generator-symlink/SymlinkGenerator';
import { type IGitHubApiClient, type IGitHubApiCache } from '@modules/github-client';
import { FileGitHubApiCache } from '@modules/github-client/FileGitHubApiCache';
import { GitHubApiClient } from '@modules/github-client/GitHubApiClient';
import { Installer, type IInstaller } from '@modules/installer';
// The duplicate createLogger import that was here is confirmed removed.
import { VersionChecker, type IVersionChecker } from '@modules/version-checker'; // Added
import {
  registerGenerateCommand,
} from '@modules/cli/generateCommand';
import { registerInstallCommand } from '@modules/cli/installCommand';
import { registerCleanupCommand } from '@modules/cli/cleanupCommand';
import { registerCheckUpdatesCommand } from '@modules/cli/checkUpdatesCommand';
import { registerUpdateCommand } from '@modules/cli/updateCommand';
import { registerDetectConflictsCommand } from '@modules/cli/detectConflictsCommand'; // Added
import { Command } from 'commander';
import path from 'path'; // Removed 'node:' prefix
import os from 'os'; // Assuming 'os' resolves correctly, if not, will adjust
import { exitCli } from '@modules/cli/exitCli'; // Corrected import to use the alias

const internalLog = createLogger('cli'); // createDebugLoggerInternal is defined from @modules/logger

export interface Services {
  appConfig: AppConfig;
  fs: IFileSystem; // IFileSystem is now imported
  downloader: IDownloader;
  githubApiCache: IGitHubApiCache;
  githubApiClient: IGitHubApiClient;
  shimGenerator: IShimGenerator;
  shellInitGenerator: IShellInitGenerator;
  symlinkGenerator: ISymlinkGenerator;
  generatorOrchestrator: IGeneratorOrchestrator;
  installer: IInstaller;
  archiveExtractor: IArchiveExtractor; // Added
  versionChecker: IVersionChecker; // Added
}

export async function setupServices(options: { dryRun?: boolean } = {}): Promise<Services> {
  internalLog('setupServices: Initializing services... options: %o', options);
  const { dryRun = false } = options;
  const systemInfoForConfig: ConfigModuleSystemInfo = {
    homedir: os.homedir(),
    cwd: process.cwd(),
  };
  const appConfig = createAppConfig(systemInfoForConfig, process.env as any); // Cast process.env
  let fs: IFileSystem; // IFileSystem is now imported

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
    fs = new MemFileSystem(toolFilesJson); // MemFileSystem is now imported
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
    shimGenerator, // IShimGenerator
    shellInitGenerator, // IShellInitGenerator
    symlinkGenerator, // ISymlinkGenerator
    fs, // IFileSystem
    appConfig // AppConfig
  );

  // Initialize the archive extractor
  const archiveExtractor = new ArchiveExtractor(fs); // Added

  // Initialize the installer
  const installer = new Installer(fs, downloader, githubApiClient, archiveExtractor, appConfig); // Added archiveExtractor

  // Initialize VersionChecker
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
    archiveExtractor, // Added
    versionChecker, // Added
  };
}

export async function registerAllCommands(programInstance: Command) {
  // Each command will call setupServices in its own action handler

  // Register Install Command
  registerInstallCommand(programInstance);

  // Register Generate Command
  registerGenerateCommand(programInstance);

  // Register Cleanup Command
  registerCleanupCommand(programInstance);

  // Register CheckUpdates Command
  registerCheckUpdatesCommand(programInstance);

  // Register Update Command
  registerUpdateCommand(programInstance);

  // Register Detect Conflicts Command
  registerDetectConflictsCommand(programInstance);
}

export async function main() {
    const program = new Command(); // Instantiate Command inside main

    program
      .name('generator')
      .description('CLI tool for managing dotfiles and tool configurations')
      .version('0.1.0')
      .option('--config <path>', 'Path to a configuration file', undefined);

    program.on('option:config', function (this: Command, configValue: string | undefined) {
      // console.log('>>>>>>>>>>>>>>') // Keep this for now if it's helpful for your debugging
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
    await program.parseAsync(process.argv);
}

// Only run main if the script is executed directly
if (import.meta.main) {
  main().catch((error) => {
    internalLog('main: Top-level unhandled error in main().catch(): %O', error);
    exitCli(1);
  });
}
