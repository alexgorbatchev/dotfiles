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
 *   - [x] Instantiate `IFileSystem` (using `NodeFileSystem`).
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
 *     - [x] Call `generatorOrchestrator.generateArtifacts()`.
 *     - [x] Add basic success/error logging.
 * - [x] Parse CLI arguments using `program.parse(process.argv)`.
 * - [x] Write basic tests for the CLI (`generator/src/__tests__/cli.test.ts`).
 * - [x] Update `generator/package.json` with `bin` field and build script (Verified).
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Ensure 100% test coverage for executable code.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import { Command } from 'commander';
import {
  createAppConfig,
  type AppConfig,
  type SystemInfo as ConfigModuleSystemInfo,
} from './modules/config';
import { NodeFileSystem } from './modules/file-system/NodeFileSystem';
import { Downloader } from './modules/downloader/Downloader';
import { NodeFetchStrategy } from './modules/downloader/NodeFetchStrategy';
import { FileGitHubApiCache } from './modules/github-client/FileGitHubApiCache';
import { GitHubApiClient } from './modules/github-client/GitHubApiClient';
import { ShimGenerator } from './modules/generator-shim/ShimGenerator';
import { ShellInitGenerator } from './modules/generator-shell-init/ShellInitGenerator';
import { SymlinkGenerator } from './modules/generator-symlink/SymlinkGenerator';
import { GeneratorOrchestrator } from './modules/generator-orchestrator/GeneratorOrchestrator';
import type { ToolConfig } from './types';
import { createLogger } from './modules/logger';
import type { IFileSystem } from './modules/file-system/IFileSystem';
import type { IDownloader } from './modules/downloader/IDownloader';
import type { IGitHubApiCache } from './modules/github-client/IGitHubApiCache';
import type { IGitHubApiClient } from './modules/github-client/IGitHubApiClient';
import type { IShimGenerator } from './modules/generator-shim/IShimGenerator';
import type { IShellInitGenerator } from './modules/generator-shell-init/IShellInitGenerator';
import type { ISymlinkGenerator } from './modules/generator-symlink/ISymlinkGenerator';
import type { IGeneratorOrchestrator } from './modules/generator-orchestrator/IGeneratorOrchestrator';
import os from 'os';

const log = createLogger('cli');

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
}

export async function setupServices(): Promise<Services> {
  log('setupServices: Initializing services...');
  const systemInfoForConfig: ConfigModuleSystemInfo = {
    homedir: os.homedir(),
    cwd: process.cwd(),
  };
  const appConfig = await createAppConfig(systemInfoForConfig, process.env as any); // Cast process.env
  const fs = new NodeFileSystem();
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
  log('setupServices: Services initialized.');
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
  };
}

// Stub for loadToolConfigs
export async function loadToolConfigs(): Promise<Record<string, ToolConfig>> {
  log('loadToolConfigs: Stub called, returning empty configs.');
  // In a real implementation, this would dynamically load *.tool.ts files
  return {};
}

export const program = new Command();

program
  .name('mydotfiles')
  .description('CLI tool for managing dotfiles and tool configurations')
  .version('0.1.0');

program
  .command('generate')
  .description('Generate all artifacts (shims, shell init, symlinks)')
  .option('--dry-run', 'Perform a dry run without making changes', false)
  .action(async (options: { dryRun: boolean }) => {
    log('generate: Command called with options: %o', options);
    try {
      const { generatorOrchestrator } = await setupServices();
      const toolConfigs = await loadToolConfigs();

      log(
        'generate: Calling generatorOrchestrator.generateArtifacts with dryRun: %s',
        options.dryRun
      );
      const manifest = await generatorOrchestrator.generateAll(toolConfigs, {
        dryRun: options.dryRun,
        // generatorVersion can be added here if needed from package.json
      });
      log('generate: Artifacts generated successfully. Manifest: %o', manifest);
      console.log('Artifact generation complete.');
      if (options.dryRun) {
        console.log('Dry run complete. No changes were made.');
      }
    } catch (error) {
      log('generate: Error during artifact generation: %O', error);
      console.error('Error during artifact generation:', error);
      process.exit(1);
    }
  });

export async function main() {
  await program.parseAsync(process.argv);
}

// Only run main if the script is executed directly
if (import.meta.main) {
  main().catch((error) => {
    log('main: Unhandled error in CLI: %O', error);
    console.error('Unhandled error in CLI:', error);
    process.exit(1);
  });
}
