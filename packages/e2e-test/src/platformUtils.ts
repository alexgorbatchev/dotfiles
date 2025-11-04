import { Architecture, Platform } from '@dotfiles/core';

/**
 * Convert Platform enum to CLI string value
 */
export function platformToString(platform: Platform): string {
  const mapping: Record<Platform, string> = {
    [Platform.MacOS]: 'macos',
    [Platform.Linux]: 'linux',
    [Platform.Windows]: 'windows',
    [Platform.Unix]: 'linux',
    [Platform.All]: 'linux',
    [Platform.None]: 'linux',
  };
  const result: string | undefined = mapping[platform];
  if (result === undefined) {
    throw new Error(`Unknown platform: ${platform}`);
  }
  return result;
}

/**
 * Convert Architecture enum to CLI string value
 */
export function architectureToString(architecture: Architecture): string {
  const mapping: Record<Architecture, string> = {
    [Architecture.X86_64]: 'x86_64',
    [Architecture.Arm64]: 'arm64',
    [Architecture.All]: 'x86_64',
    [Architecture.None]: 'x86_64',
  };
  const result: string | undefined = mapping[architecture];
  if (result === undefined) {
    throw new Error(`Unknown architecture: ${architecture}`);
  }
  return result;
}
