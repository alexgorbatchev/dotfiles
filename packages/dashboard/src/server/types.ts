import type { IConfigService } from '@dotfiles/config';
import type { ISystemInfo, ProjectConfig, ToolConfig } from '@dotfiles/core';
import type { IResolvedFileSystem } from '@dotfiles/file-system';
import type { IFileRegistry } from '@dotfiles/registry/file';
import type { IToolInstallationRegistry } from '@dotfiles/registry/tool';
import type { IVersionChecker } from '@dotfiles/version-checker';

/**
 * Services required by the dashboard server.
 */
export interface IDashboardServices {
  projectConfig: ProjectConfig;
  fs: IResolvedFileSystem;
  configService: IConfigService;
  systemInfo: ISystemInfo;
  fileRegistry: IFileRegistry;
  toolInstallationRegistry: IToolInstallationRegistry;
  versionChecker: IVersionChecker;
}

/**
 * Cached tool configs loaded from .tool.ts files.
 * Cached to avoid re-parsing on every API request.
 */
export type ToolConfigsCache = Record<string, ToolConfig>;

/**
 * Options for starting the dashboard server.
 */
export interface IDashboardServerOptions {
  port: number;
  host: string;
}

/**
 * Dashboard server interface.
 */
export interface IDashboardServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  getUrl(): string;
}
