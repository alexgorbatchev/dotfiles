import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type { IConfigService, ProjectConfig } from '@dotfiles/config';
import type { InstallerPluginRegistry, ISystemInfo } from '@dotfiles/core';
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

export interface IServices {
  projectConfig: ProjectConfig;
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
  systemInfo: ISystemInfo;
}

export interface IGlobalProgramOptions {
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
export interface IBaseCommandOptions extends IGlobalProgramOptions {}

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
export interface IUpdateCommandSpecificOptions {
  // TODO --yes is not yet implemented
  yes: boolean;
  shimMode: boolean;
}

/**
 * Command-specific options for cleanup command (excludes global options)
 */
export interface ICleanupCommandSpecificOptions {
  tool?: string;
  type?: string;
  all?: boolean;
}

/**
 * Command-specific options for log command (excludes global options)
 */
export interface ILogCommandSpecificOptions {
  tool?: string; // Positional argument
  type?: string;
  status?: boolean;
  since?: string;
}

export interface IGlobalProgram extends Omit<Command, 'opts'> {
  /**
   * Get the parsed options for this command, properly typed as IGlobalProgramOptions
   * @returns The parsed global program options
   */
  opts(): IGlobalProgramOptions;
}
