import type { ISystemInfo, PlatformConfig, PlatformConfigEntry, ToolConfig } from '@dotfiles/core';
import { Architecture, hasArchitecture, hasPlatform, Platform } from '@dotfiles/core';

/**
 * Checks if a platform config entry matches the given system info.
 * @param entry - The platform configuration entry to check
 * @param systemInfo - The current system information
 * @returns True if the platform config matches the system
 */
function matchesPlatform(entry: PlatformConfigEntry, systemInfo: ISystemInfo): boolean {
  // If system platform is unknown, no match
  if (systemInfo.platform === Platform.None) {
    return false;
  }

  // Check if system platform matches the entry's platforms using hasPlatform helper
  const platformMatches = hasPlatform(entry.platforms, systemInfo.platform);
  if (!platformMatches) {
    return false;
  }

  // If architectures are specified in the entry, check for architecture match
  if (entry.architectures !== undefined) {
    if (systemInfo.arch === Architecture.None) {
      return false; // Unknown architecture doesn't match any specific requirement
    }
    const archMatches = hasArchitecture(entry.architectures, systemInfo.arch);
    if (!archMatches) {
      return false;
    }
  }

  return true;
}

function deepCopyShellTypeConfig(
  config: NonNullable<NonNullable<ToolConfig['shellConfigs']>['zsh']>,
): NonNullable<NonNullable<ToolConfig['shellConfigs']>['zsh']> {
  return {
    ...config,
    scripts: config.scripts ? [...config.scripts] : undefined,
    functions: config.functions ? { ...config.functions } : undefined,
    paths: config.paths ? [...config.paths] : undefined,
  };
}

function deepCopyShellConfigs(shellConfigs: ToolConfig['shellConfigs']): ToolConfig['shellConfigs'] {
  if (!shellConfigs) return undefined;

  return {
    zsh: shellConfigs.zsh ? deepCopyShellTypeConfig(shellConfigs.zsh) : undefined,
    bash: shellConfigs.bash ? deepCopyShellTypeConfig(shellConfigs.bash) : undefined,
    powershell: shellConfigs.powershell ? deepCopyShellTypeConfig(shellConfigs.powershell) : undefined,
  };
}

function initializeShellConfigs(finalConfig: ToolConfig): void {
  if (!finalConfig.shellConfigs) {
    finalConfig.shellConfigs = {
      zsh: undefined,
      bash: undefined,
      powershell: undefined,
    };
  }
}

function mergeShellConfig(
  shellConfigs: NonNullable<ToolConfig['shellConfigs']>,
  shellType: 'zsh' | 'bash' | 'powershell',
  platformShellConfig: NonNullable<ToolConfig['shellConfigs']>[typeof shellType],
): void {
  if (!platformShellConfig) return;

  if (!shellConfigs[shellType]) {
    shellConfigs[shellType] = {};
  }

  // oxlint-disable-next-line @typescript-eslint/no-non-null-assertion: shellConfigs[shellType] is guaranteed to exist after the check above
  const targetShellConfig = shellConfigs[shellType]!;

  if (platformShellConfig.scripts) {
    targetShellConfig.scripts = [...(targetShellConfig.scripts || []), ...platformShellConfig.scripts];
  }

  if (platformShellConfig.completions) {
    targetShellConfig.completions = platformShellConfig.completions;
  }

  if (platformShellConfig.aliases) {
    targetShellConfig.aliases = { ...targetShellConfig.aliases, ...platformShellConfig.aliases };
  }

  if (platformShellConfig.env) {
    targetShellConfig.env = {
      ...targetShellConfig.env,
      ...platformShellConfig.env,
    };
  }

  if (platformShellConfig.functions) {
    targetShellConfig.functions = { ...targetShellConfig.functions, ...platformShellConfig.functions };
  }

  if (platformShellConfig.paths) {
    targetShellConfig.paths = [...(targetShellConfig.paths || []), ...platformShellConfig.paths];
  }
}

function mergeShellConfigs(finalConfig: ToolConfig, platformShellConfigs: ToolConfig['shellConfigs']): void {
  if (!platformShellConfigs) return;

  initializeShellConfigs(finalConfig);
  // shellConfigs is guaranteed to exist after initializeShellConfigs
  // oxlint-disable-next-line @typescript-eslint/no-non-null-assertion: shellConfigs is guaranteed to exist after initializeShellConfigs
  const shellConfigs = finalConfig.shellConfigs!;

  mergeShellConfig(shellConfigs, 'zsh', platformShellConfigs.zsh);
  mergeShellConfig(shellConfigs, 'bash', platformShellConfigs.bash);
  mergeShellConfig(shellConfigs, 'powershell', platformShellConfigs.powershell);
}

function applyPlatformOverrides(finalConfig: ToolConfig, platformConfig: PlatformConfig): void {
  if (platformConfig.binaries !== undefined) {
    finalConfig.binaries = platformConfig.binaries;
  }
  if (platformConfig.dependencies !== undefined) {
    finalConfig.dependencies = platformConfig.dependencies;
  }
  if (platformConfig.version !== undefined) {
    finalConfig.version = platformConfig.version;
  }
  if (platformConfig.updateCheck !== undefined) {
    finalConfig.updateCheck = platformConfig.updateCheck;
  }
  if (platformConfig.installationMethod !== undefined) {
    finalConfig.installationMethod = platformConfig.installationMethod;
  }
  if (platformConfig.installParams !== undefined) {
    finalConfig.installParams = platformConfig.installParams;
  }
}

function createBaseResolvedConfig(toolConfig: ToolConfig): ToolConfig {
  const resolvedConfig = {
    ...toolConfig,
    shellConfigs: deepCopyShellConfigs(toolConfig.shellConfigs),
    dependencies: toolConfig.dependencies ? [...toolConfig.dependencies] : undefined,
  };

  const { platformConfigs, ...configWithoutPlatforms } = resolvedConfig;
  return configWithoutPlatforms;
}

/**
 * Resolves platform-specific configurations for a tool based on system information.
 * Merges the base tool configuration with matching platform-specific overrides.
 *
 * @param toolConfig - The base tool configuration
 * @param systemInfo - The current system information
 * @returns A resolved tool configuration with platform-specific overrides applied
 */
export function resolvePlatformConfig(toolConfig: ToolConfig, systemInfo: ISystemInfo): ToolConfig {
  // If no platform configs exist, return the original config
  if (!toolConfig.platformConfigs || toolConfig.platformConfigs.length === 0) {
    return toolConfig;
  }

  // Find matching platform configurations
  const matchingConfigs = toolConfig.platformConfigs.filter((entry) => matchesPlatform(entry, systemInfo));

  // If no matches found, return the original config without platformConfigs
  if (matchingConfigs.length === 0) {
    const { platformConfigs, ...configWithoutPlatforms } = toolConfig;
    return configWithoutPlatforms;
  }

  // Start with a deep copy of the base config (excluding platformConfigs to avoid recursion)
  const finalConfig = createBaseResolvedConfig(toolConfig);

  // Apply each matching platform config in order
  for (const match of matchingConfigs) {
    const config = match.config;
    // Merge shell configs
    mergeShellConfigs(finalConfig, config.shellConfigs);

    // Merge symlinks arrays
    if (config.symlinks) {
      finalConfig.symlinks = [...(finalConfig.symlinks || []), ...config.symlinks];
    }

    // Override other properties
    applyPlatformOverrides(finalConfig, config);
  }

  return finalConfig;
}
