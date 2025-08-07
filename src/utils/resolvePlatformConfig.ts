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

  // Start with a copy of the base config (excluding platformConfigs to avoid recursion)
  const resolvedConfig = { ...toolConfig };
  delete (resolvedConfig as any).platformConfigs;

  // Apply each matching platform config in order
  for (const match of matchingConfigs) {
    // Merge shell init arrays
    if (match.config.zshInit) {
      resolvedConfig.zshInit = [...(resolvedConfig.zshInit || []), ...match.config.zshInit];
    }
    if (match.config.bashInit) {
      resolvedConfig.bashInit = [...(resolvedConfig.bashInit || []), ...match.config.bashInit];
    }
    if (match.config.powershellInit) {
      resolvedConfig.powershellInit = [...(resolvedConfig.powershellInit || []), ...match.config.powershellInit];
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