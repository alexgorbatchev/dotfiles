import type { CompletionConfig } from './completion.types';
import type { Platform, Architecture } from './platform.types';
import type { ShellScript } from './shellScript.types';
import type { 
  GithubReleaseInstallParams,
  BrewInstallParams,
  CurlScriptInstallParams,
  CurlTarInstallParams,
  ManualInstallParams
} from './installParams.types';
import type { ToolConfigUpdateCheck } from './toolConfigBuilder.types';

/**
 * Base properties common to all variants of a fully resolved {@link ToolConfig}.
 * This represents the internal data structure after the `ToolConfigBuilder` has been processed.
 */
interface BaseToolConfigProperties {
  /** The unique name of the tool, as defined by `c.name()`. */
  name: string;
  /**
   * An array of binary names that should have shims generated for this tool.
   * Defined by `c.bin()`. Can be undefined if no binaries are specified (e.g., for a config-only tool).
   */
  binaries?: string[];
  /** The desired version of the tool, defined by `c.version()`. Defaults to 'latest'. */
  version: string;
  /** The absolute path to the tool configuration file that defined this configuration. */
  configFilePath?: string;
  /** An array of Zsh initialization scripts, added via `c.zsh()`. */
  zshInit?: ShellScript[];
  /** An array of Bash initialization scripts, added via `c.bash()`. */
  bashInit?: ShellScript[];
  /** An array of PowerShell initialization scripts, added via `c.powershell()`. */
  powershellInit?: ShellScript[];
  /**
   * An array of symlink configurations, added via `c.symlink()`. Each object has `source` and `target` paths where
   * `source` is real file and `target` is the symlink.
   * 
   * Analogous to `ln -s source target`.
   */
  symlinks?: { source: string; target: string }[];
  /** Shell completion configurations, defined by `c.completions()`. */
  completions?: CompletionConfig;
  /**
   * Configuration for automatic update checking for this tool.
   */
  updateCheck?: ToolConfigUpdateCheck;
  /**
   * An array of platform-specific configurations.
   * Each entry defines configurations for a specific set of platforms and optionally architectures.
   */
  platformConfigs?: PlatformConfigEntry[];
}

/**
 * Configuration overrides that can be applied in platform-specific configurations.
 * This includes all tool configuration properties except name and platformConfigs
 * to avoid circular references.
 */
export interface PlatformConfig {
  /** An array of binary names that should have shims generated for this tool. */
  binaries?: string[];
  /** The desired version of the tool. */
  version?: string;
  /** An array of Zsh initialization scripts. */
  zshInit?: ShellScript[];
  /** An array of Bash initialization scripts. */
  bashInit?: ShellScript[];  
  /** An array of PowerShell initialization scripts. */
  powershellInit?: ShellScript[];
  /** An array of symlink configurations. */
  symlinks?: { source: string; target: string }[];
  /** Shell completion configurations. */
  completions?: CompletionConfig;
  /** Configuration for automatic update checking for this tool. */
  updateCheck?: ToolConfigUpdateCheck;
  /** The installation method to use. */
  installationMethod?: ToolConfigInstallationMethod;
  /** Parameters specific to the installation method. */
  installParams?: GithubReleaseInstallParams | BrewInstallParams | CurlScriptInstallParams | CurlTarInstallParams | ManualInstallParams;
}

/**
 * Represents a single platform-specific configuration entry.
 * It specifies the target platforms (and optionally architectures) and the
 * configuration overrides that apply to them.
 */
export interface PlatformConfigEntry {
  /** A bitmask of target platforms for this configuration. */
  platforms: Platform;
  /** An optional bitmask of target architectures for this configuration. If undefined, applies to all architectures on the specified platforms. */
  architectures?: Architecture;
  /** The actual configuration settings for this platform/architecture combination. */
  config: PlatformConfig;
}

/** Resolved tool configuration for the 'github-release' installation method. */
export type GithubReleaseToolConfig = BaseToolConfigProperties & {
  installationMethod: 'github-release';
  installParams: GithubReleaseInstallParams;
  /** Binaries are typically required for this installation method. */
  binaries: string[];
};

/** Resolved tool configuration for the 'brew' installation method. */
export type BrewToolConfig = BaseToolConfigProperties & {
  installationMethod: 'brew';
  installParams: BrewInstallParams;
  /** Binaries are typically required for this installation method. */
  binaries: string[];
};

/** Resolved tool configuration for the 'curl-script' installation method. */
export type CurlScriptToolConfig = BaseToolConfigProperties & {
  installationMethod: 'curl-script';
  installParams: CurlScriptInstallParams;
  /** Binaries are typically required for this installation method. */
  binaries: string[];
};

/** Resolved tool configuration for the 'curl-tar' installation method. */
export type CurlTarToolConfig = BaseToolConfigProperties & {
  installationMethod: 'curl-tar';
  installParams: CurlTarInstallParams;
  /** Binaries are typically required for this installation method. */
  binaries: string[];
};

/** Resolved tool configuration for the 'manual' installation method. */
export type ManualToolConfig = BaseToolConfigProperties & {
  installationMethod: 'manual';
  installParams: ManualInstallParams;
  /** Binaries are typically required for this installation method. */
  binaries: string[];
};

/**
 * Resolved tool configuration for tools that do not have a primary installation method defined
 * at the top level (e.g., they might only consist of Zsh initializations, symlinks, or rely entirely
 * on architecture-specific overrides for installation).
 * The `binaries` property is optional here, inherited from {@link BaseToolConfigProperties}.
 */
export type NoInstallToolConfig = BaseToolConfigProperties & {
  /** Indicates that no top-level installation method is specified. */
  installationMethod: 'none';
  /** Installation parameters are explicitly undefined or absent for this type. */
  installParams?: undefined;
};

/**
 * Represents a tool's complete, resolved configuration after being processed by the `ToolConfigBuilder`.
 * This is a discriminated union based on the `installationMethod` property, allowing TypeScript
 * to correctly infer the type of `installParams` and other method-specific properties.
 */
export type ToolConfig =
  | GithubReleaseToolConfig
  | BrewToolConfig
  | CurlScriptToolConfig
  | CurlTarToolConfig
  | ManualToolConfig
  | NoInstallToolConfig;

export type ToolConfigInstallationMethod = ToolConfig['installationMethod'];
export type ToolConfigInstallParams = ToolConfig['installParams'];