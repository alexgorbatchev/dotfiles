import { z } from 'zod';

/**
 * Enum representing different operating system platforms.
 * Values are bitwise, allowing for combinations.
 */
export enum Platform {
  None = 0,
  Linux = 1 << 0, // 1
  MacOS = 1 << 1, // 2
  Windows = 1 << 2, // 4
  Unix = Platform.Linux | Platform.MacOS, // 3
  All = Platform.Linux | Platform.MacOS | Platform.Windows, // 7
}

/**
 * Enum representing different CPU architectures.
 * Values are bitwise, allowing for combinations.
 */
export enum Architecture {
  None = 0,
  X86_64 = 1 << 0, // 1
  Arm64 = 1 << 1, // 2
  All = Architecture.X86_64 | Architecture.Arm64, // 3
}

/**
 * Zod schema for Platform enum values.
 * Validates that a number is a valid Platform bitmask.
 */
export const platformSchema = z
  .number()
  .int()
  .min(0)
  .max(Platform.All)
  .refine(
    (value) => {
      // Check if the value is a valid combination of Platform enum values
      const validBits = Platform.All;
      return (value & ~validBits) === 0;
    },
    {
      message:
        'Must be a valid Platform value. Use: Platform.None, Platform.Linux, Platform.MacOS, Platform.Windows, Platform.Unix, or Platform.All. You can combine values with bitwise OR (e.g., Platform.Linux | Platform.MacOS).',
    }
  );

/**
 * Zod schema for Architecture enum values.
 * Validates that a number is a valid Architecture bitmask.
 */
export const architectureSchema = z
  .number()
  .int()
  .min(0)
  .max(Architecture.All)
  .refine(
    (value) => {
      // Check if the value is a valid combination of Architecture enum values
      const validBits = Architecture.All;
      return (value & ~validBits) === 0;
    },
    {
      message:
        'Must be a valid Architecture value. Use: Architecture.None, Architecture.X86_64, Architecture.Arm64, or Architecture.All. You can combine values with bitwise OR (e.g., Architecture.X86_64 | Architecture.Arm64).',
    }
  );

/**
 * Checks if a given platform is included in a set of target platforms.
 * @param targetPlatforms - The bitmask of target platforms.
 * @param platform - The platform to check.
 * @returns True if the platform is included, false otherwise.
 */
export function hasPlatform(targetPlatforms: Platform, platform: Platform): boolean {
  if (platform === Platform.None) {
    return targetPlatforms === Platform.None;
  }
  return (targetPlatforms & platform) === platform;
}

/**
 * Checks if a given architecture is included in a set of target architectures.
 * @param targetArchitectures - The bitmask of target architectures.
 * @param architecture - The architecture to check.
 * @returns True if the architecture is included, false otherwise.
 */
export function hasArchitecture(targetArchitectures: Architecture, architecture: Architecture): boolean {
  if (architecture === Architecture.None) {
    return targetArchitectures === Architecture.None;
  }
  return (targetArchitectures & architecture) === architecture;
}
