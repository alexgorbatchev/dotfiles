import type { ICache, IDownloader } from '@dotfiles/downloader';
import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type { IFileRegistry } from '@dotfiles/registry/file';
import type { IFileSystem } from '@dotfiles/file-system';
import type { IGeneratorOrchestrator } from '@dotfiles/generator-orchestrator';
import type { IShellInitGenerator } from '@dotfiles/shell-init-generator';
import type { IShimGenerator } from '@dotfiles/shim-generator';
import type { ISymlinkGenerator } from '@dotfiles/symlink-generator';
import type { IInstaller } from '@dotfiles/installer';
import type { ICargoClient } from '@dotfiles/installer/clients/cargo';
import type { IGitHubApiClient } from '@dotfiles/installer/clients/github';
import type { IToolInstallationRegistry } from '@dotfiles/registry/tool';
import type { IVersionChecker } from '@dotfiles/version-checker';
import type { SystemInfo } from '@dotfiles/schemas';
import type { YamlConfig } from '@dotfiles/config';
import type { Command } from 'commander';

export interface Services {
  yamlConfig: YamlConfig;
  fs: IFileSystem;
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
  installer: IInstaller;
  archiveExtractor: IArchiveExtractor;
  versionChecker: IVersionChecker;
  systemInfo: SystemInfo;
}

export type GlobalProgram = Command;
export interface GlobalProgramOptions {
  config: string;
  dryRun: boolean;
  verbose: boolean;
  quiet: boolean;
  platform?: string;
  arch?: string;
}
