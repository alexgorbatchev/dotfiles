import type { SystemInfo } from '@dotfiles/core';
import type { ArchitecturePatterns } from './types';

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
 *
 * @public
 */
export function getArchitecturePatterns(systemInfo: SystemInfo): ArchitecturePatterns {
  const patterns: ArchitecturePatterns = {
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
  switch (systemInfo.platform.toLowerCase()) {
    case 'darwin':
      // Zinit original:
      // _sys='(apple|darwin|apple-darwin|dmg|mac((-|)os|)|os(-|64|)x)'
      // where mac((-|)os|) expands to: mac, mac-os, macos
      // and os(-|64|)x expands to: osx, os-x, os64x
      patterns.system = ['apple', 'darwin', 'apple-darwin', 'dmg', 'mac', 'macos', 'mac-os', 'osx', 'os-x', 'os64x'];
      patterns.variants = ['darwin'];
      break;

    case 'linux':
      // Zinit original:
      // _sys='(musl|gnu)*~^*(unknown|)linux*'
      // This is a complex zsh pattern with negation. Breaking it down:
      // - The pattern matches (musl|gnu) followed by anything
      // - BUT excludes patterns that don't contain 'unknown' or 'linux'
      // For simplicity and correctness, we just use 'linux' for system matching
      // and provide musl/gnu/unknown-linux as variants
      patterns.system = ['linux'];
      patterns.variants = ['musl', 'gnu', 'unknown-linux'];
      break;

    case 'win32':
      // Zinit original:
      // (MINGW* | MSYS* | CYGWIN* | Windows_NT)
      // _sys='pc-windows-gnu'
      //
      // We expand this to include common Windows platform identifiers
      patterns.system = ['windows', 'win32', 'win64', 'pc-windows-gnu'];
      patterns.variants = ['mingw', 'msys', 'cygwin', 'pc-windows'];
      break;

    default:
      // Zinit original: (*)
      //   +zi-log "{e} {b}gh-r{rst}Unsupported OS: {obj}$_os{rst}"
      //
      // We handle unknown platforms gracefully by using the platform name
      patterns.system = [systemInfo.platform.toLowerCase()];
      patterns.variants = [systemInfo.platform.toLowerCase()];
      break;
  }

  // Handle CPU Architecture patterns
  // Zinit logic for architecture detection:
  // https://github.com/zdharma-continuum/zinit/blob/158796e49c553293228c02b043c6373878500533/zinit-install.zsh#L210-L228
  switch (systemInfo.arch.toLowerCase()) {
    case 'arm64':
    case 'aarch64':
      // Zinit original:
      // (aarch64 | arm64)
      // _cpu='(arm|aarch)64'
      //
      // BUG FIX: Zinit includes 'arm' which incorrectly matches armv5/v6/v7
      // These are completely different architectures. ARM64/aarch64 is 64-bit ARMv8.
      // We only match specific 64-bit ARM patterns.
      patterns.cpu = ['arm64', 'aarch64', 'aarch'];
      break;

    case 'x64':
    case 'x86_64':
    case 'amd64':
      // Zinit original (partially):
      // (amd64 | i386 | i486 | i686| i786 | x64 | x86 | x86-64 | x86_64)
      // _cpu='(amd64|x86_64|x64)'
      //
      // Note: Zinit's case statement mixes 32-bit and 64-bit x86 architectures
      // and outputs the same pattern. We separate them correctly.
      patterns.cpu = ['amd64', 'x86_64', 'x64', 'x86-64'];
      break;

    case 'ia32':
    case 'x86':
    case 'i386':
    case 'i486':
    case 'i686':
    case 'i786':
      // Zinit original: See note above - zinit incorrectly handles this
      //
      // BUG FIX: These are 32-bit architectures and should have their own patterns,
      // not be merged with 64-bit patterns
      patterns.cpu = ['i386', 'i486', 'i686', 'i786', 'x86', 'ia32'];
      break;

    case 'armv6l':
      // Zinit original:
      // (armv6l)
      // _os=${_os}eabihf
      //
      // We provide comprehensive CPU patterns and add eabihf to variants
      patterns.cpu = ['armv6l', 'armv6', 'arm6'];
      patterns.variants.push('eabihf');
      break;

    case 'armv7l':
    case 'armv8l':
      // Zinit original:
      // (armv7l | armv8l)
      // _os=${_os}eabihf
      //
      // We provide comprehensive CPU patterns and add eabihf to variants
      patterns.cpu = ['armv7l', 'armv8l', 'armv7', 'armv8', 'arm7', 'arm8'];
      patterns.variants.push('eabihf');
      break;

    default:
      // Zinit original: (*)
      //   +zi-log "{e} {b}gh-r{rst}Unsupported CPU: {obj}$_cpu{rst}"
      //
      // We handle unknown architectures gracefully by using the arch name
      patterns.cpu = [systemInfo.arch.toLowerCase()];
      break;
  }

  return patterns;
}
