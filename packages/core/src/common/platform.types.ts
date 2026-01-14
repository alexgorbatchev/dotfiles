import { z } from 'zod';

/**
 * Represents operating system platforms using a bitwise enum, allowing for
 * combinations of multiple platforms.
 *
 * @example
 * ```typescript
 * const supported = Platform.Linux | Platform.MacOS;
 * if (supported & Platform.Linux) {
 *   // Supported on Linux
 * }
 * ```
 */
export enum Platform {
  /** Represents no specific platform. */
  None = 0,
  /** The Linux operating system. */
  Linux = 1 << 0, // 1
  /** The macOS operating system. */
  MacOS = 1 << 1, // 2
  /** The Windows operating system. */
  Windows = 1 << 2, // 4
  /** A combination of Unix-like systems (Linux and macOS). */
  Unix = Platform.Linux | Platform.MacOS, // 3
  /** A combination of all supported platforms. */
  All = Platform.Linux | Platform.MacOS | Platform.Windows, // 7
}

/**
 * Represents CPU architectures using a bitwise enum, allowing for combinations.
 *
 * @example
 * ```typescript
 * const supported = Architecture.X86_64 | Architecture.Arm64;
 * if (supported & Architecture.Arm64) {
 *   // Supported on ARM64
 * }
 * ```
 */
export enum Architecture {
  /** Represents no specific architecture. */
  None = 0,
  /** The 64-bit x86 architecture (also known as AMD64). */
  X86_64 = 1 << 0, // 1
  /** The 64-bit ARM architecture. */
  Arm64 = 1 << 1, // 2
  /** A combination of all supported architectures. */
  All = Architecture.X86_64 | Architecture.Arm64, // 3
}

/**
 * A Zod schema for validating `Platform` enum values.
 *
 * Ensures that a given number is a valid bitmask composed of `Platform` enum members.
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
        'Must be a valid Platform value. Use `Platform.None`, `Platform.Linux`, `Platform.MacOS`, `Platform.Windows`, `Platform.Unix`, or `Platform.All`. You can combine values with a bitwise OR (e.g., `Platform.Linux | Platform.MacOS`).',
    },
  );

/**
 * A Zod schema for validating `Architecture` enum values.
 *
 * Ensures that a given number is a valid bitmask composed of `Architecture` enum members.
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
        'Must be a valid Architecture value. Use `Architecture.None`, `Architecture.X86_64`, `Architecture.Arm64`, or `Architecture.All`. You can combine values with a bitwise OR (e.g., `Architecture.X86_64 | Architecture.Arm64`).',
    },
  );

/**
 * Checks if a specific platform is included within a bitmask of target platforms.
 *
 * @param targetPlatforms - A bitmask representing the set of allowed platforms.
 * @param platform - The platform to check for inclusion.
 * @returns `true` if the `platform` is included in `targetPlatforms`, otherwise `false`.
 */
export function hasPlatform(targetPlatforms: Platform, platform: Platform): boolean {
  if (platform === Platform.None) {
    return targetPlatforms === Platform.None;
  }
  return (targetPlatforms & platform) === platform;
}

/**
 * Checks if a specific architecture is included within a bitmask of target architectures.
 *
 * @param targetArchitectures - A bitmask representing the set of allowed architectures.
 * @param architecture - The architecture to check for inclusion.
 * @returns `true` if the `architecture` is included in `targetArchitectures`, otherwise `false`.
 */
export function hasArchitecture(targetArchitectures: Architecture, architecture: Architecture): boolean {
  if (architecture === Architecture.None) {
    return targetArchitectures === Architecture.None;
  }
  return (targetArchitectures & architecture) === architecture;
}

/**
 * Converts a Node.js platform string to a Platform enum value.
 *
 * @param platform - The platform string from `process.platform`
 * @returns The corresponding Platform enum value, or `Platform.None` if not supported
 */
export function platformFromNodeJS(platform: NodeJS.Platform): Platform {
  switch (platform) {
    case 'darwin':
      return Platform.MacOS;
    case 'linux':
      return Platform.Linux;
    case 'win32':
      return Platform.Windows;
    default:
      return Platform.None;
  }
}

/**
 * Converts a Node.js architecture string to an Architecture enum value.
 *
 * @param arch - The architecture string from `process.arch`
 * @returns The corresponding Architecture enum value, or `Architecture.None` if not supported
 */
export function architectureFromNodeJS(arch: NodeJS.Architecture): Architecture {
  switch (arch) {
    case 'x64':
      return Architecture.X86_64;
    case 'arm64':
      return Architecture.Arm64;
    default:
      return Architecture.None;
  }
}

/**
 * Converts a Platform enum value to a human-readable string.
 *
 * @param platform - The platform enum value
 * @returns The platform name as a string
 */
export function platformToString(platform: Platform): string {
  switch (platform) {
    case Platform.MacOS:
      return 'macos';
    case Platform.Linux:
      return 'linux';
    case Platform.Windows:
      return 'windows';
    case Platform.None:
      return 'none';
    default:
      return 'unknown';
  }
}

/**
 * Converts an Architecture enum value to a human-readable string.
 *
 * @param arch - The architecture enum value
 * @returns The architecture name as a string
 */
export function architectureToString(arch: Architecture): string {
  switch (arch) {
    case Architecture.X86_64:
      return 'x86_64';
    case Architecture.Arm64:
      return 'arm64';
    case Architecture.None:
      return 'none';
    default:
      return 'unknown';
  }
}
