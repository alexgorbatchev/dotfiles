import type { ProjectConfig } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { IFileRegistry } from '@dotfiles/registry/file';
import type { IToolInstallationRegistry } from '@dotfiles/registry/tool';
import type { IVersionChecker } from '@dotfiles/version-checker';

/**
 * Services required by the dashboard server.
 */
export interface IDashboardServices {
  projectConfig: ProjectConfig;
  fs: IFileSystem;
  fileRegistry: IFileRegistry;
  toolInstallationRegistry: IToolInstallationRegistry;
  versionChecker: IVersionChecker;
}

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
