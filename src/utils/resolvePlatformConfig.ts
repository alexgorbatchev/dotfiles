import type { ToolConfig, PlatformConfigEntry, SystemInfo } from '@types';
import { Platform, Architecture, hasPlatform, hasArchitecture } from '@types';

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
  const matchingConfigs = toolConfig.platformConfigs.filter(entry => 
    matchesPlatform(entry, systemInfo)
  );

  // If no matches found, return the original config without platformConfigs
  if (matchingConfigs.length === 0) {
    const configWithoutPlatforms = { ...toolConfig };
    delete (configWithoutPlatforms as any).platformConfigs;
    return configWithoutPlatforms;
  }

  // Start with a deep copy of the base config (excluding platformConfigs to avoid recursion)
  const resolvedConfig = { 
    ...toolConfig,
    shellConfigs: toolConfig.shellConfigs ? {
      ...toolConfig.shellConfigs,
      zsh: toolConfig.shellConfigs.zsh ? {
        ...toolConfig.shellConfigs.zsh,
        scripts: toolConfig.shellConfigs.zsh.scripts ? [...toolConfig.shellConfigs.zsh.scripts] : undefined
      } : undefined,
      bash: toolConfig.shellConfigs.bash ? {
        ...toolConfig.shellConfigs.bash,
        scripts: toolConfig.shellConfigs.bash.scripts ? [...toolConfig.shellConfigs.bash.scripts] : undefined
      } : undefined,
      powershell: toolConfig.shellConfigs.powershell ? {
        ...toolConfig.shellConfigs.powershell,
        scripts: toolConfig.shellConfigs.powershell.scripts ? [...toolConfig.shellConfigs.powershell.scripts] : undefined
      } : undefined,
    } : undefined
  };
  delete (resolvedConfig as any).platformConfigs;

  // Apply each matching platform config in order
  for (const match of matchingConfigs) {
    // Merge shell configs
    if (match.config.shellConfigs) {
      // Ensure resolvedConfig.shellConfigs exists
      if (!resolvedConfig.shellConfigs) {
        resolvedConfig.shellConfigs = {} as any;
      }
      
      // Merge zsh scripts
      if (match.config.shellConfigs.zsh?.scripts) {
        if (!resolvedConfig.shellConfigs!.zsh) {
          resolvedConfig.shellConfigs!.zsh = { scripts: undefined };
        }
        resolvedConfig.shellConfigs!.zsh!.scripts = [
          ...(resolvedConfig.shellConfigs!.zsh!.scripts || []),
          ...match.config.shellConfigs.zsh.scripts
        ];
      }
      
      // Merge bash scripts
      if (match.config.shellConfigs.bash?.scripts) {
        if (!resolvedConfig.shellConfigs!.bash) {
          resolvedConfig.shellConfigs!.bash = { scripts: undefined };
        }
        resolvedConfig.shellConfigs!.bash!.scripts = [
          ...(resolvedConfig.shellConfigs!.bash!.scripts || []),
          ...match.config.shellConfigs.bash.scripts
        ];
      }
      
      // Merge powershell scripts
      if (match.config.shellConfigs.powershell?.scripts) {
        if (!resolvedConfig.shellConfigs!.powershell) {
          resolvedConfig.shellConfigs!.powershell = { scripts: undefined };
        }
        resolvedConfig.shellConfigs!.powershell!.scripts = [
          ...(resolvedConfig.shellConfigs!.powershell!.scripts || []),
          ...match.config.shellConfigs.powershell.scripts
        ];
      }
      
      // TODO: Also merge aliases and environment variables when those are implemented
    }

    // Merge symlinks arrays
    if (match.config.symlinks) {
      resolvedConfig.symlinks = [...(resolvedConfig.symlinks || []), ...match.config.symlinks];
    }

    // Override other properties
    if (match.config.binaries !== undefined) {
      (resolvedConfig as any).binaries = match.config.binaries;
    }
    if (match.config.version !== undefined) {
      resolvedConfig.version = match.config.version;
    }
    if (match.config.installationMethod !== undefined) {
      (resolvedConfig as any).installationMethod = match.config.installationMethod;
    }
    if (match.config.installParams !== undefined) {
      (resolvedConfig as any).installParams = match.config.installParams;
    }
    if (match.config.completions !== undefined) {
      resolvedConfig.completions = match.config.completions;
    }
    if (match.config.updateCheck !== undefined) {
      resolvedConfig.updateCheck = match.config.updateCheck;
    }
  }

  return resolvedConfig;
}