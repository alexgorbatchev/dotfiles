import type { ISystemInfo } from "@dotfiles/core";
import { Architecture, Libc, Platform } from "@dotfiles/core";
import type { IArchitecturePatterns } from "./types";

function getLinuxVariants(libc: Libc | undefined): string[] {
  switch (libc ?? Libc.Unknown) {
    case Libc.Gnu:
      return ["gnu", "musl", "unknown-linux"];
    case Libc.Musl:
      return ["musl", "gnu", "unknown-linux"];
    default:
      return ["unknown-linux", "gnu", "musl"];
  }
}

/**
 * Generates a set of architecture-specific patterns based on the provided
 * system information.
 *
 * This function translates system properties like OS and CPU architecture into a
 * collection of string patterns that are commonly found in the names of release
 * assets on platforms like GitHub. The logic is based on the architecture
 * detection mechanism used in Zinit.
 *
 * @param systemInfo - An object containing system information, typically from `os.platform()` and `os.arch()`.
 * @returns An object containing arrays of patterns for the system, CPU, and variants.
 *
 * @see {@link https://github.com/zdharma-continuum/zinit/blob/master/zinit-install.zsh} for the original implementation.
 */
export function getArchitecturePatterns(systemInfo: ISystemInfo): IArchitecturePatterns {
  const patterns: IArchitecturePatterns = {
    system: [],
    cpu: [],
    variants: [],
  };

  // Based on the Zinit script, the order of pattern matching is roughly:
  // 1. OS (e.g., 'darwin', 'linux')
  // 2. Architecture (e.g., 'amd64', 'arm64')
  // 3. Variants (e.g., 'musl', 'gnu', 'eabihf')
  // This function generates the patterns; the matching logic is in `selectBestMatch`.

  // Handle OS/Platform patterns
  // Zinit logic for OS detection:
  // https://github.com/zdharma-continuum/zinit/blob/158796e49c553293228c02b043c6373878500533/zinit-install.zsh#L194-L208
  switch (systemInfo.platform) {
    case Platform.MacOS:
      // Zinit original:
      // _sys='(apple|darwin|apple-darwin|dmg|mac((-|)os|)|os(-|64|)x)'
      // where mac((-|)os|) expands to: mac, mac-os, macos
      // and os(-|64|)x expands to: osx, os-x, os64x
      patterns.system = ["apple", "darwin", "apple-darwin", "dmg", "mac", "macos", "mac-os", "osx", "os-x", "os64x"];
      patterns.variants = ["darwin"];
      break;

    case Platform.Linux:
      // Zinit original:
      // _sys='(musl|gnu)*~^*(unknown|)linux*'
      // This is a complex zsh pattern with negation. Breaking it down:
      // - The pattern matches (musl|gnu) followed by anything
      // - BUT excludes patterns that don't contain 'unknown' or 'linux'
      // For simplicity and correctness, we just use 'linux' for system matching
      // and keep libc-related variants available for tie-breaking.
      patterns.system = ["linux"];
      patterns.variants = getLinuxVariants(systemInfo.libc);
      break;

    case Platform.Windows:
      // Zinit original:
      // (MINGW* | MSYS* | CYGWIN* | Windows_NT)
      // _sys='pc-windows-gnu'
      //
      // We expand this to include common Windows platform identifiers
      patterns.system = ["windows", "win32", "win64", "pc-windows-gnu"];
      patterns.variants = ["mingw", "msys", "cygwin", "pc-windows"];
      break;

    default:
      // Handle Platform.None or unknown platforms
      // Return empty patterns since we can't match
      patterns.system = [];
      patterns.variants = [];
      break;
  }

  // Handle CPU Architecture patterns
  // Zinit logic for architecture detection:
  // https://github.com/zdharma-continuum/zinit/blob/158796e49c553293228c02b043c6373878500533/zinit-install.zsh#L210-L228
  switch (systemInfo.arch) {
    case Architecture.Arm64:
      // Zinit original:
      // (aarch64 | arm64)
      // _cpu='(arm|aarch)64'
      //
      // BUG FIX: Zinit includes 'arm' which incorrectly matches armv5/v6/v7
      // These are completely different architectures. ARM64/aarch64 is 64-bit ARMv8.
      // We only match specific 64-bit ARM patterns.
      patterns.cpu = ["arm64", "aarch64", "aarch"];
      break;

    case Architecture.X86_64:
      // Zinit original (partially):
      // (amd64 | i386 | i486 | i686| i786 | x64 | x86 | x86-64 | x86_64)
      // _cpu='(amd64|x86_64|x64)'
      //
      // Note: Zinit's case statement mixes 32-bit and 64-bit x86 architectures
      // and outputs the same pattern. We separate them correctly.
      patterns.cpu = ["amd64", "x86_64", "x64", "x86-64"];
      break;

    default:
      // Handle Architecture.None or unknown architectures
      // Return empty patterns since we can't match
      patterns.cpu = [];
      break;
  }

  return patterns;
}
