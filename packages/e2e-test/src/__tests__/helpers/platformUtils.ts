import { Architecture, Platform } from "@dotfiles/core";

/**
 * Converts a Platform enum value to its CLI string representation.
 *
 * @param platform - The Platform enum value to convert.
 * @returns The CLI string for the platform (e.g., 'macos', 'linux', 'windows').
 * @throws {Error} If the platform value is not recognized.
 */
export function platformToString(platform: Platform): string {
  const mapping: Record<Platform, string> = {
    [Platform.MacOS]: "macos",
    [Platform.Linux]: "linux",
    [Platform.Windows]: "windows",
    [Platform.Unix]: "linux",
    [Platform.All]: "linux",
    [Platform.None]: "linux",
  };
  const result: string | undefined = mapping[platform];
  if (result === undefined) {
    throw new Error(`Unknown platform: ${platform}`);
  }
  return result;
}

/**
 * Converts an Architecture enum value to its CLI string representation.
 *
 * @param architecture - The Architecture enum value to convert.
 * @returns The CLI string for the architecture (e.g., 'x86_64', 'arm64').
 * @throws {Error} If the architecture value is not recognized.
 */
export function architectureToString(architecture: Architecture): string {
  const mapping: Record<Architecture, string> = {
    [Architecture.X86_64]: "x86_64",
    [Architecture.Arm64]: "arm64",
    [Architecture.All]: "x86_64",
    [Architecture.None]: "x86_64",
  };
  const result: string | undefined = mapping[architecture];
  if (result === undefined) {
    throw new Error(`Unknown architecture: ${architecture}`);
  }
  return result;
}
