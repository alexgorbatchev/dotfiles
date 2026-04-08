import type { IConfigService } from "@dotfiles/config";
import type { InstallerPluginRegistry, ISystemInfo, ProjectConfig, ToolConfig } from "@dotfiles/core";
import type { IDownloader } from "@dotfiles/downloader";
import type { IResolvedFileSystem } from "@dotfiles/file-system";
import type { IInstaller } from "@dotfiles/installer";
import type { IFileRegistry } from "@dotfiles/registry/file";
import type { IToolInstallationRegistry } from "@dotfiles/registry/tool";
import type { IVersionChecker } from "@dotfiles/version-checker";

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
  downloader: IDownloader;
  installer: IInstaller;
  pluginRegistry: InstallerPluginRegistry;
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
 * Request for named tool routes.
 */
export interface INamedToolRequest extends Request {
  params: {
    name: string;
  };
}

/**
 * Dashboard server interface.
 */
export interface IDashboardServer {
  /** Starts the server. Returns true if this is a HMR restart. */
  start(): Promise<boolean>;
  stop(): Promise<void>;
  getUrl(): string;
}
