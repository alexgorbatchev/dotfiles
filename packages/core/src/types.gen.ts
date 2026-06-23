/* Do not change, this code is generated from Golang structs */

export interface CacheConfig {
  enabled: boolean;
  ttl: number;
}
export interface HostConfig {
  host: string;
  cache: CacheConfig;
  token: string;
  userAgent: string;
}
export interface PathsConfig {
  homeDir: string;
  dotfilesDir: string;
  targetDir: string;
  generatedDir: string;
  toolConfigsDir: string;
  shellScriptsDir: string;
  binariesDir: string;
}
export interface SystemConfig {
  sudoPrompt: string;
}
export interface LoggingConfig {
  debug: string;
}
export interface UpdatesConfig {
  checkOnRun: boolean;
  checkInterval: number;
}
export interface CargoConfig {
  cratesIo: HostConfig;
  githubRaw: HostConfig;
  githubRelease: HostConfig;
  userAgent: string;
}
export interface DownloaderConfig {
  timeout: number;
  retryCount: number;
  retryDelay: number;
  cache: CacheConfig;
}
export interface CatalogConfig {
  generate: boolean;
  filePath: string;
}
export interface ShellInstallConfig {
  zsh?: string;
  bash?: string;
  powershell?: string;
}
export interface FeaturesConfig {
  catalog: CatalogConfig;
  shellInstall?: ShellInstallConfig;
}
export interface ProjectConfig {
  paths: PathsConfig;
  system: SystemConfig;
  logging: LoggingConfig;
  updates: UpdatesConfig;
  github: HostConfig;
  cargo: CargoConfig;
  downloader: DownloaderConfig;
  features: FeaturesConfig;
}
export interface BinaryConfig {
  name: string;
  pattern: string;
}
export interface SymlinkConfig {
  source: string;
  target: string;
}
export interface CopyConfig {
  source: string;
  target: string;
}
export interface ShellScript {
  kind: string;
  value: string;
}
export interface ShellTypeConfig {
  scripts?: ShellScript[];
  aliases?: { [key: string]: string };
  env?: { [key: string]: string };
  functions?: { [key: string]: string };
  paths?: any[];
  completions?: any;
}
export interface ShellConfigs {
  zsh?: ShellTypeConfig;
  bash?: ShellTypeConfig;
  powershell?: ShellTypeConfig;
}
export interface ToolConfigUpdateCheck {
  enabled?: boolean;
  constraint?: string;
}
export interface PlatformConfigEntry {
  platforms: number;
  architectures?: number;
  config: any;
}
export interface ToolConfig {
  name: string;
  version?: string;
  configFilePath?: string;
  binaries?: any[];
  dependencies?: string[];
  disabled?: boolean;
  hostname?: string;
  sudo?: boolean;
  shellConfigs?: ShellConfigs;
  symlinks?: SymlinkConfig[];
  copies?: CopyConfig[];
  updateCheck?: ToolConfigUpdateCheck;
  platformConfigs?: PlatformConfigEntry[];
  installationMethod?: string;
  installParams?: { [key: string]: any };
}
