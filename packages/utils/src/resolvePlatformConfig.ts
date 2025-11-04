import type { PlatformConfig, PlatformConfigEntry, SystemInfo, ToolConfig } from '@dotfiles/core';
import { Architecture, hasArchitecture, hasPlatform, Platform } from '@dotfiles/core';

/**
 * Detects the current operating system using the same logic as yamlConfigLoader
 * @param platform - The platform from SystemInfo (from NodeJS.Process)
 * @returns The detected OS as a Platform enum
 */
function detectPlatformEnum(platform: string): Platform {
  if (platform === 'darwin') return Platform.MacOS;
  if (platform === 'linux') return Platform.Linux;
  if (platform === 'win32') return Platform.Windows;
  return Platform.None;
}

/**
 * Detects the current architecture using the same logic as yamlConfigLoader
 * @param arch - The architecture from SystemInfo (from NodeJS.Process)
 * @returns The detected architecture as an Architecture enum
 */
function detectArchitectureEnum(arch: string): Architecture {
  if (arch === 'x64') return Architecture.X86_64;
  if (arch === 'arm64') return Architecture.Arm64;
  return Architecture.None;
}

/**
 * Checks if a platform config entry matches the given system info.
 * @param entry - The platform configuration entry to check
 * @param systemInfo - The current system information
 * @returns True if the platform config matches the system
 */
function matchesPlatform(entry: PlatformConfigEntry, systemInfo: SystemInfo): boolean {
  const currentPlatformEnum = detectPlatformEnum(systemInfo.platform);
  const currentArchEnum = detectArchitectureEnum(systemInfo.arch);

  // If system platform is unknown, no match
  if (currentPlatformEnum === Platform.None) {
    return false;
  }

  // Check if system platform matches the entry's platforms using hasPlatform helper
  const platformMatches = hasPlatform(entry.platforms, currentPlatformEnum);
  if (!platformMatches) {
    return false;
  }

  // If architectures are specified in the entry, check for architecture match
  if (entry.architectures !== undefined) {
    if (currentArchEnum === Architecture.None) {
      return false; // Unknown architecture doesn't match any specific requirement
    }
    const archMatches = hasArchitecture(entry.architectures, currentArchEnum);
    if (!archMatches) {
      return false;
    }
  }

  return true;
}

function deepCopyShellConfigs(shellConfigs: ToolConfig['shellConfigs']): ToolConfig['shellConfigs'] {
  if (!shellConfigs) return undefined;

  return {
    zsh: shellConfigs.zsh
      ? {
          ...shellConfigs.zsh,
          scripts: shellConfigs.zsh.scripts ? [...shellConfigs.zsh.scripts] : undefined,
        }
      : undefined,
    bash: shellConfigs.bash
      ? {
          ...shellConfigs.bash,
          scripts: shellConfigs.bash.scripts ? [...shellConfigs.bash.scripts] : undefined,
        }
      : undefined,
    powershell: shellConfigs.powershell
      ? {
          ...shellConfigs.powershell,
          scripts: shellConfigs.powershell.scripts ? [...shellConfigs.powershell.scripts] : undefined,
        }
      : undefined,
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
  platformShellConfig: NonNullable<ToolConfig['shellConfigs']>[typeof shellType]
): void {
  if (!platformShellConfig) return;

  if (!shellConfigs[shellType]) {
    shellConfigs[shellType] = {};
  }

  // biome-ignore lint/style/noNonNullAssertion: shellConfigs[shellType] is guaranteed to exist after the check above
  const targetShellConfig = shellConfigs[shellType]!;

  if (platformShellConfig.scripts) {
    targetShellConfig.scripts = [...(targetShellConfig.scripts || []), ...platformShellConfig.scripts];
  }

  if (platformShellConfig.completions) {
    targetShellConfig.completions = platformShellConfig.completions;
  }

  if (platformShellConfig.aliases) {
    targetShellConfig.aliases = { ...(targetShellConfig.aliases || {}), ...platformShellConfig.aliases };
  }

  if (platformShellConfig.environment) {
    targetShellConfig.environment = {
      ...(targetShellConfig.environment || {}),
      ...platformShellConfig.environment,
    };
  }
}

function mergeShellConfigs(finalConfig: ToolConfig, platformShellConfigs: ToolConfig['shellConfigs']): void {
  if (!platformShellConfigs) return;

  initializeShellConfigs(finalConfig);
  // shellConfigs is guaranteed to exist after initializeShellConfigs
  // biome-ignore lint/style/noNonNullAssertion: shellConfigs is guaranteed to exist after initializeShellConfigs
  const shellConfigs = finalConfig.shellConfigs!;

  mergeShellConfig(shellConfigs, 'zsh', platformShellConfigs.zsh);
  mergeShellConfig(shellConfigs, 'bash', platformShellConfigs.bash);
  mergeShellConfig(shellConfigs, 'powershell', platformShellConfigs.powershell);
}

function applyPlatformOverrides(finalConfig: ToolConfig, platformConfig: PlatformConfig): void {
  if (platformConfig.binaries !== undefined) {
    finalConfig.binaries = platformConfig.binaries;
  }
  if (platformConfig.version !== undefined) {
    finalConfig.version = platformConfig.version;
  }
  if (platformConfig.updateCheck !== undefined) {
    finalConfig.updateCheck = platformConfig.updateCheck;
  }
}

function createBaseResolvedConfig(toolConfig: ToolConfig): ToolConfig {
  const resolvedConfig = {
    ...toolConfig,
    shellConfigs: deepCopyShellConfigs(toolConfig.shellConfigs),
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
export function resolvePlatformConfig(toolConfig: ToolConfig, systemInfo: SystemInfo): ToolConfig {
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
