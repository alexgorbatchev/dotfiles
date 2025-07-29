import { createLogger } from '@modules/logger/createLogger';

const log = createLogger('platform.types');

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
* Checks if a given platform is included in a set of target platforms.
 * @param targetPlatforms - The bitmask of target platforms.
 * @param platform - The platform to check.
 * @returns True if the platform is included, false otherwise.
 */
export function hasPlatform(targetPlatforms: Platform, platform: Platform): boolean {
  log('hasPlatform: targetPlatforms=%s, platform=%s', targetPlatforms, platform);
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
export function hasArchitecture(
  targetArchitectures: Architecture,
  architecture: Architecture,
): boolean {
  log('hasArchitecture: targetArchitectures=%s, architecture=%s', targetArchitectures, architecture);
  if (architecture === Architecture.None) {
    return targetArchitectures === Architecture.None;
  }
  return (targetArchitectures & architecture) === architecture;
}