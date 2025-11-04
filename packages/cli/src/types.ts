import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type { IConfigService, YamlConfig } from '@dotfiles/config';
import type { InstallerPluginRegistry, SystemInfo } from '@dotfiles/core';
import type { ICache, IDownloader } from '@dotfiles/downloader';
import type { IReadmeService } from '@dotfiles/features';
import type { IFileSystem } from '@dotfiles/file-system';
import type { IGeneratorOrchestrator } from '@dotfiles/generator-orchestrator';
import type { IInstaller } from '@dotfiles/installer';
import type { ICargoClient } from '@dotfiles/installer-cargo';
import type { IGitHubApiClient } from '@dotfiles/installer-github';
import type { IFileRegistry } from '@dotfiles/registry/file';
import type { IToolInstallationRegistry } from '@dotfiles/registry/tool';
import type { IShellInitGenerator } from '@dotfiles/shell-init-generator';
import type { IShimGenerator } from '@dotfiles/shim-generator';
import type { ISymlinkGenerator } from '@dotfiles/symlink-generator';
import type { IVersionChecker } from '@dotfiles/version-checker';
import type { Command } from 'commander';

export interface Services {
  yamlConfig: YamlConfig;
  fs: IFileSystem;
  configService: IConfigService;
  fileRegistry: IFileRegistry;
  toolInstallationRegistry: IToolInstallationRegistry;
  downloadCache: ICache | undefined;
  downloader: IDownloader;
  githubApiCache: ICache;
  cargoCratesIoCache: ICache;
  cargoGithubRawCache: ICache;
  githubApiClient: IGitHubApiClient;
  cargoClient: ICargoClient;
  shimGenerator: IShimGenerator;
  shellInitGenerator: IShellInitGenerator;
  symlinkGenerator: ISymlinkGenerator;
  generatorOrchestrator: IGeneratorOrchestrator;
  readmeService: IReadmeService;
  installer: IInstaller;
  archiveExtractor: IArchiveExtractor;
  versionChecker: IVersionChecker;
  pluginRegistry: InstallerPluginRegistry;
  systemInfo: SystemInfo;
}

export interface GlobalProgramOptions {
  config: string;
  dryRun: boolean;
  log: string;
  verbose: boolean;
  quiet: boolean;
  platform?: string;
  arch?: string;
}

/**
 * Base interface for command options that includes global program options
 */
export interface BaseCommandOptions extends GlobalProgramOptions {}

/**
 * Command-specific options for install command (excludes global options)
 */
export interface InstallCommandSpecificOptions {
  force: boolean;
  shimMode: boolean;
}

/**
 * Command-specific options for update command (excludes global options)
 */
export interface UpdateCommandSpecificOptions {
  yes: boolean;
  shimMode: boolean;
}

/**
 * Command-specific options for cleanup command (excludes global options)
 */
export interface CleanupCommandSpecificOptions {
  tool?: string;
  type?: string;
  all?: boolean;
  registry?: boolean;
}

/**
 * Command-specific options for files command (excludes global options)
 */
export interface FilesCommandSpecificOptions {
  tool?: string;
  type?: string;
  status?: boolean;
  since?: string;
}

export interface GlobalProgram extends Omit<Command, 'opts'> {
  /**
   * Get the parsed options for this command, properly typed as GlobalProgramOptions
   * @returns The parsed global program options
   */
  opts(): GlobalProgramOptions;
}
