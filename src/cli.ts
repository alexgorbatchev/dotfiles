#!/usr/bin/env bun

/**
 * @file cli.ts
 * @description Main CLI entry point for the dotfiles management application.
 */

import {
  createAppConfig,
  type AppConfig,
  type SystemInfo as ConfigModuleSystemInfo,
} from '@modules/config';
// createClientLogger was removed from here as it's unused in this file.
// It's imported and used within individual command modules' action handlers.
import { createLogger } from '@modules/logger'; // Added import for createDebugLoggerInternal
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
import { exitCli } from '@exitCli'; // Corrected import to use the alias

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

export const program = new Command();

program
  .name('generator')
  .description('CLI tool for managing dotfiles and tool configurations')
  .version('0.1.0');

export async function registerAllCommands(programInstance: Command) {
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
  registerDetectConflictsCommand(programInstance); // Added
}

export async function main() {
  try {
    await registerAllCommands(program);
    await program.parseAsync(process.argv);
  } catch (error) {
    // This catch block handles errors from registerAllCommands or program.parseAsync
    // when main() is called directly (e.g., in tests).
    console.error('Error during main CLI execution:', error);
    exitCli(1); // Use the imported exitCli directly
  }
}

// Only run main if the script is executed directly
if (import.meta.main) {
  main().catch((error) => {
    // This .catch() is for when main() itself might throw an unhandled error
    // (e.g., if exitCli wasn't called or if main had a bug not caught by its own try/catch).
    // However, with the try/catch now inside main(), this outer catch might only
    // catch errors if exitCli itself fails to throw properly in a non-test env,
    // or if there's an issue outside the main try/catch (e.g. top-level await problem if any).
    // For robustness, we keep a simplified handler.
    internalLog('main: Top-level unhandled error: %O', error);
    // Avoid calling console.error again if it was already called by main's internal catch.
    // If error came from exitCli, it's already handled by throwing.
    // If it's a different error, log it.
    if (!(error instanceof Error && error.message.startsWith('TEST_EXIT_CLI_CALLED_WITH_')) && !(error instanceof Error && error.message.startsWith('MOCK_EXIT_CLI_CALLED_'))) {
        console.error('Top-level unhandled error in CLI execution:', error);
    }
    // Ensure process exits if not already handled by exitCli (which throws in test)
    if (process.env.NODE_ENV !== 'test') {
        process.exit(1); // Fallback exit for non-test env if exitCli didn't terminate
    } else {
        // In test, if we reached here and exitCli didn't throw, rethrow or throw new.
        // This path should ideally not be hit if exitCli works as expected.
        if (!(error instanceof Error && (error.message.startsWith('TEST_EXIT_CLI_CALLED_WITH_') || error.message.startsWith('MOCK_EXIT_CLI_CALLED_')))) {
          throw error; // Rethrow original error if it wasn't an exit-related throw
        }
    }
  });
}
