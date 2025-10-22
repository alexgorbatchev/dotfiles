import type { ArchitecturePatterns, SystemInfo } from '@dotfiles/schemas';

/**
 * Generates architecture patterns for the given system information.
 * Based on Zinit's `.zi::get-architecture` function logic.
 *
 * @param systemInfo - System information from os module
 * @returns Architecture patterns for matching GitHub release assets
 */
export function getArchitecturePatterns(systemInfo: SystemInfo): ArchitecturePatterns {
  const patterns: ArchitecturePatterns = {
    system: [],
    cpu: [],
    variants: [],
  };

  // Handle OS/Platform patterns
  switch (systemInfo.platform.toLowerCase()) {
    case 'darwin':
      patterns.system = ['apple', 'darwin', 'apple-darwin', 'dmg', 'mac', 'macos', 'mac-os', 'osx', 'os-x', 'os64x'];
      patterns.variants = ['darwin'];
      break;

    case 'linux':
      patterns.system = ['linux'];
      patterns.variants = ['musl', 'gnu', 'unknown-linux'];
      break;

    case 'win32':
      patterns.system = ['windows', 'win32', 'win64', 'pc-windows-gnu'];
      patterns.variants = ['mingw', 'msys', 'cygwin', 'pc-windows'];
      break;

    default:
      // For unknown platforms, use the platform name directly
      patterns.system = [systemInfo.platform.toLowerCase()];
      patterns.variants = [systemInfo.platform.toLowerCase()];
      break;
  }

  // Handle CPU Architecture patterns
  switch (systemInfo.arch.toLowerCase()) {
    case 'arm64':
    case 'aarch64':
      patterns.cpu = ['arm64', 'aarch64', 'arm', 'aarch'];
      break;

    case 'x64':
    case 'x86_64':
    case 'amd64':
      patterns.cpu = ['amd64', 'x86_64', 'x64', 'x86-64'];
      break;

    case 'ia32':
    case 'x86':
    case 'i386':
    case 'i486':
    case 'i686':
    case 'i786':
      patterns.cpu = ['i386', 'i486', 'i686', 'i786', 'x86', 'ia32'];
      break;

    case 'armv6l':
      patterns.cpu = ['armv6l', 'armv6', 'arm6'];
      patterns.variants.push('eabihf');
      break;

    case 'armv7l':
    case 'armv8l':
      patterns.cpu = ['armv7l', 'armv8l', 'armv7', 'armv8', 'arm7', 'arm8'];
      patterns.variants.push('eabihf');
      break;

    default:
      // For unknown architectures, use the arch name directly
      patterns.cpu = [systemInfo.arch.toLowerCase()];
      break;
  }

  return patterns;
}
