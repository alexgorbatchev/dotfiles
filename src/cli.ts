#!/usr/bin/env bun

/**
 * @file cli.ts
 * @description Main CLI entry point for the dotfiles management application.
 *
 * ## Development Plan
 *
 * - [x] Add shebang and basic file structure.
 * - [x] Import necessary modules (`commander`, services, types).
 * - [x] Implement a simplified DependencyInjection (DI) setup function.
 *   - [x] Instantiate `AppConfig`.
 *   - [x] Instantiate `IFileSystem` (conditionally `NodeFileSystem` or `MemFileSystem`).
 *   - [x] Instantiate `IDownloader` (using `Downloader` with `NodeFetchStrategy`).
 *   - [x] Instantiate `IGitHubApiCache` (using `FileGitHubApiCache`).
 *   - [x] Instantiate `IGitHubApiClient`.
 *   - [x] Instantiate `IShimGenerator`.
 *   - [x] Instantiate `IShellInitGenerator`.
 *   - [x] Instantiate `ISymlinkGenerator`.
 *   - [x] Instantiate `IGeneratorOrchestrator`.
 * - [x] Define the `generate` command using `commander`.
 *   - [x] Add `--dry-run` option.
 *   - [x] Implement the action handler:
 *     - [x] Instantiate `GeneratorOrchestrator` via DI setup.
 *     - [x] Create a stub for `loadToolConfigs()`.
 *     - [x] Call `generatorOrchestrator.generateAll()` (without dryRun option).
 *     - [x] Add basic success/error logging.
 * - [x] Parse CLI arguments using `program.parse(process.argv)`.
 * - [x] Write basic tests for the CLI (`generator/src/__tests__/cli.test.ts`).
 * - [x] Update `generator/package.json` with `bin` field and build script (Verified).
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [x] Refactor dry run mechanism to inject IFileSystem.
 *   - [x] Modify `cli.ts` to conditionally instantiate `IFileSystem` in `setupServices`.
 *   - [x] Modify `cli.ts` to remove `dryRun` option from `generateAll` call.
 * - [x] Integrate real `loadToolConfigs` function.
 * - [x] Pre-populate `MemFileSystem` with actual `*.tool.ts` files from `toolConfigsDir` during `--dry-run`.
 *   - [x] In `setupServices`, when `dryRun` is true:
 *     - [x] Use `AppConfig` to get `toolConfigsDir`.
 *     - [x] Use a temporary `NodeFileSystem` to read `*.tool.ts` files from `toolConfigsDir`.
 *     - [x] Initialize `MemFileSystem` with the content of these files.
 * - [x] Enhance `install` command error message for "tool not found" to include `toolConfigsDir` and available tools.
 * - [x] Enhance `install` command output to show symlink path and other changes.
 * - [x] Add `--details` flag to `install` command for optional detailed output. (Replaced by --verbose)
 * - [x] Integrate clientLogger for improved logging.
 * - [x] Rename `--details` to `--verbose` and add `--quiet` to `install` command.
 * - [x] Add `--verbose` and `--quiet` to `generate` command.
 * [x] Ensure 100% test coverage for executable code.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import { Command } from 'commander';
import {
  createAppConfig,
  type AppConfig,
  type SystemInfo as ConfigModuleSystemInfo,
} from './modules/config';
import { NodeFileSystem } from './modules/file-system/NodeFileSystem';
import { MemFileSystem, type DirectoryJSON } from './modules/file-system/MemFileSystem'; // Added import and DirectoryJSON
import { Downloader } from './modules/downloader/Downloader';
import { NodeFetchStrategy } from './modules/downloader/NodeFetchStrategy';
import { FileGitHubApiCache } from './modules/github-client/FileGitHubApiCache';
import { GitHubApiClient } from './modules/github-client/GitHubApiClient';
import { ShimGenerator } from './modules/generator-shim/ShimGenerator';
import { ShellInitGenerator } from './modules/generator-shell-init/ShellInitGenerator';
import { SymlinkGenerator } from './modules/generator-symlink/SymlinkGenerator';
import { GeneratorOrchestrator } from './modules/generator-orchestrator/GeneratorOrchestrator';
import { Installer } from './modules/installer/Installer';
import { ArchiveExtractor } from './modules/extractor/ArchiveExtractor'; // Added import
// ToolConfig import removed as it's not directly used in this file,
// realLoadToolConfigs handles it internally.
import { createLogger as createDebugLoggerInternal } from './modules/logger';
import { createClientLogger } from './modules/logger/clientLogger'; // CreateClientLoggerOptions removed
// import type { Logger as ClientLoggerType } from '@node-cli/logger'; // Unused import
import type { IFileSystem } from './modules/file-system/IFileSystem';
import type { IDownloader } from './modules/downloader/IDownloader';
import type { IGitHubApiCache } from './modules/github-client/IGitHubApiCache';
import type { IGitHubApiClient } from './modules/github-client/IGitHubApiClient';
import type { IShimGenerator } from './modules/generator-shim/IShimGenerator';
import type { IShellInitGenerator } from './modules/generator-shell-init/IShellInitGenerator';
import type { ISymlinkGenerator } from './modules/generator-symlink/ISymlinkGenerator';
import type { IGeneratorOrchestrator } from './modules/generator-orchestrator/IGeneratorOrchestrator';
import type { IInstaller } from './modules/installer/IInstaller';
import type { IArchiveExtractor } from './modules/extractor/IArchiveExtractor'; // Added import
import { loadToolConfigs as realLoadToolConfigs } from './modules/config-loader/toolConfigLoader'; // Added import
import os from 'os';
import path from 'node:path'; // Added import for path.join

const internalLog = createDebugLoggerInternal('cli'); // Renamed to avoid conflict

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
  archiveExtractor: IArchiveExtractor; // Added
}

export async function setupServices(options: { dryRun?: boolean } = {}): Promise<Services> {
  internalLog('setupServices: Initializing services... options: %o', options);
  const { dryRun = false } = options;
  const systemInfoForConfig: ConfigModuleSystemInfo = {
    homedir: os.homedir(),
    cwd: process.cwd(),
  };
  const appConfig = await createAppConfig(systemInfoForConfig, process.env as any); // Cast process.env
  let fs: IFileSystem;

  if (dryRun) {
    internalLog('setupServices: Dry run enabled. Initializing MemFileSystem with tool configs.');
    const realToolConfigsDir = appConfig.toolConfigsDir;
    const tempNodeFs = new NodeFileSystem(); // Temporary real FS to read tool configs
    const toolFilesJson: DirectoryJSON = {};

    try {
      if (await tempNodeFs.exists(realToolConfigsDir)) {
        internalLog(
          'setupServices: Reading tool configs from actual directory: %s',
          realToolConfigsDir
        );
        const filesInDir = await tempNodeFs.readdir(realToolConfigsDir);
        for (const fileName of filesInDir) {
          if (fileName.endsWith('.tool.ts')) {
            const filePath = path.join(realToolConfigsDir, fileName);
            try {
              const content = await tempNodeFs.readFile(filePath, 'utf8');
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
  };
}

// Stub for loadToolConfigs removed, real one is imported as realLoadToolConfigs

export const program = new Command();

program
  .name('mydotfiles')
  .description('CLI tool for managing dotfiles and tool configurations')
  .version('0.1.0');

program
  .command('generate')
  .description('Generate all artifacts (shims, shell init, symlinks)')
  .option('--dry-run', 'Perform a dry run without making changes', false)
  .option('--verbose', 'Show verbose output', false)
  .option('--quiet', 'Suppress all output', false)
  .action(async (options: { dryRun: boolean; verbose: boolean; quiet: boolean }) => {
    const logger = createClientLogger(options);
    internalLog('generate: Command called with options: %o', options);
    logger.debug('Generate command started with options: %o', options);

    try {
      const { generatorOrchestrator, fs, appConfig } = await setupServices({
        dryRun: options.dryRun,
      });
      const toolConfigs = await realLoadToolConfigs(appConfig, fs);

      internalLog(
        'generate: Calling generatorOrchestrator.generateAll. Dry run is %s, FileSystem is %s',
        options.dryRun,
        fs.constructor.name
      );
      logger.debug(
        'Calling generatorOrchestrator.generateAll. Dry run: %s, FS: %s',
        options.dryRun,
        fs.constructor.name
      );

      const manifest = await generatorOrchestrator.generateAll(toolConfigs, {
        // generatorVersion can be added here if needed from package.json
      });
      internalLog('generate: Artifacts generated successfully. Manifest: %o', manifest);
      logger.debug('Generated manifest: %o', manifest);
      logger.info('Artifact generation complete.');
      if (options.dryRun) {
        logger.info('Dry run complete. No changes were made.');
      }
    } catch (error) {
      internalLog('generate: Error during artifact generation: %O', error);
      logger.error('Error during artifact generation: %s', (error as Error).message);
      logger.debug('Error details: %O', error);
      process.exit(1);
    }
  });

program
  .command('install <toolName>')
  .description('Install a tool based on its configuration')
  .option('--force', 'Force installation even if the tool is already installed', false)
  .option('--verbose', 'Show verbose output including detailed installation steps', false)
  .option('--quiet', 'Suppress all output', false)
  .action(
    async (toolName: string, options: { force: boolean; verbose: boolean; quiet: boolean }) => {
      const logger = createClientLogger(options);
      internalLog('install: Command called with toolName: %s, options: %o', toolName, options);

      try {
        const { installer, fs, appConfig } = await setupServices();
        const toolConfigs = await realLoadToolConfigs(appConfig, fs);

        const toolConfig = toolConfigs[toolName];
        if (!toolConfig) {
          const availableTools = Object.keys(toolConfigs);
          let errorMessage = `Error: Tool configuration for "${toolName}" not found.\n`;
          errorMessage += `Expected tool configuration files in: ${appConfig.toolConfigsDir}\n`;
          if (availableTools.length > 0) {
            errorMessage += `Available tools: ${availableTools.join(', ')}`;
          } else {
            errorMessage += 'No tools are currently available for installation.';
          }
          logger.error(errorMessage);
          process.exit(1);
        }

        internalLog('install: Calling installer.install for tool: %s', toolName);
        logger.debug('Calling installer.install for tool: %s', toolName);
        const result = await installer.install(toolName, toolConfig, {
          force: options.force,
          // Pass verbose to the installer, it might have its own detailed logging
          verbose: options.verbose,
        });

        if (result.success) {
          internalLog('install: Tool %s installed successfully at %s', toolName, result.binaryPath);
          if (options.verbose && result.otherChanges && result.otherChanges.length > 0) {
            result.otherChanges.forEach((change) => logger.debug(change));
          }
          logger.info(`Tool "${toolName}" installed successfully.`);
          if (result.binaryPath) {
            logger.info(`Binary path: ${result.binaryPath}`);
          }
          if (result.version) {
            logger.info(`Version: ${result.version}`);
          }
          if (result.symlinkPath) {
            logger.info(`Symlink created: ${result.symlinkPath}`);
          }
        } else {
          internalLog('install: Failed to install tool %s: %s', toolName, result.error);
          logger.error(`Error installing "${toolName}": ${result.error}`);
          process.exit(1);
        }
      } catch (error) {
        internalLog('install: Error during tool installation: %O', error);
        logger.error('Error during tool installation: %s', (error as Error).message);
        logger.debug('Error details: %O', error);
        process.exit(1);
      }
    }
  );

export async function main() {
  await program.parseAsync(process.argv);
}

// Only run main if the script is executed directly
if (import.meta.main) {
  main().catch((error) => {
    // Use internalLog here as client logger might not be initialized or configured
    internalLog('main: Unhandled error in CLI: %O', error);
    console.error('Unhandled error in CLI:', error); // Keep console.error for bootstrap errors
    process.exit(1);
  });
}
