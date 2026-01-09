import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type { IConfigService, ProjectConfig } from '@dotfiles/config';
import type { InstallerPluginRegistry, ISystemInfo } from '@dotfiles/core';
import type { ICache, IDownloader } from '@dotfiles/downloader';
import type { IReadmeService } from '@dotfiles/features';
import type { IResolvedFileSystem } from '@dotfiles/file-system';
import type { IGeneratorOrchestrator } from '@dotfiles/generator-orchestrator';
import type { IInstaller } from '@dotfiles/installer';
import type { ICargoClient } from '@dotfiles/installer-cargo';
import type { IGitHubApiClient } from '@dotfiles/installer-github';
import type { IFileRegistry } from '@dotfiles/registry/file';
import type { IToolInstallationRegistry } from '@dotfiles/registry/tool';
import type { ICompletionGenerator, IShellInitGenerator } from '@dotfiles/shell-init-generator';
import type { IShimGenerator } from '@dotfiles/shim-generator';
import type { ISymlinkGenerator } from '@dotfiles/symlink-generator';
import type { IVersionChecker } from '@dotfiles/version-checker';
import type { Command } from 'commander';

export type CompletionPositionalArgType = 'tool';

/**
 * Metadata for a CLI option used in shell completion generation.
 */
export interface ICompletionOption {
  /** The option flag (e.g., '--force', '--config') */
  flag: string;
  /** Description shown in completion */
  description: string;
  /** Whether this option takes an argument */
  hasArg?: boolean;
  /** Argument placeholder (e.g., '<path>', '<level>') */
  argPlaceholder?: string;
}

/**
 * Metadata for a CLI command used in shell completion generation.
 * Each command file exports this to describe its completions.
 */
export interface ICommandCompletionMeta {
  /** Command name (e.g., 'install', 'generate') */
  name: string;
  /** Command description shown in completion */
  description: string;
  /** Command-specific options */
  options?: ICompletionOption[];
  /** Subcommands (for nested commands like 'features catalog') */
  subcommands?: ICommandCompletionMeta[];
  /** Whether the command takes a positional argument */
  hasPositionalArg?: boolean;
  /** Description of the positional argument */
  positionalArgDescription?: string;
  /** Type of positional argument for providing value completions */
  positionalArgType?: CompletionPositionalArgType;
}

export interface IServices {
  projectConfig: ProjectConfig;
  fs: IResolvedFileSystem;
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
  completionGenerator: ICompletionGenerator;
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
  trace: boolean;
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

/**
 * Command-specific options for files command (excludes global options)
 */
// biome-ignore lint/complexity/noBannedTypes: No command-specific options for files command
export type IFilesCommandSpecificOptions = {};

export interface IGlobalProgram extends Omit<Command, 'opts'> {
  /**
   * Get the parsed options for this command, properly typed as IGlobalProgramOptions
   * @returns The parsed global program options
   */
  opts(): IGlobalProgramOptions;
}
