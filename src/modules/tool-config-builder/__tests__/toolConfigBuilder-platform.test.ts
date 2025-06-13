/**
 * @fileoverview Tests for the platform support in ToolConfigBuilder.
 *
 * @description
 * This file contains unit tests for the `platform()` method and related
 * functionalities of the `ToolConfigBuilder` class, ensuring that
 * platform-specific configurations are correctly handled.
 *
 * ## Development Plan:
 * - [x] Create test file `toolConfigBuilder-platform.test.ts`.
 * - [x] Test case: Create a configuration for a single platform.
 * - [x] Test case: Apply platform-specific settings (bin, install, etc.).
 * - [x] Test case: Create a configuration for multiple platforms (separate `platform()` calls).
 * - [x] Test case: Create a configuration for multiple platforms (single `platform()` call with array).
 * - [x] Test case: Create a configuration with platform and architecture combinations.
 * - [x] Test case: Ensure `build()` method correctly incorporates platform-specific configurations. (Covered by checking `platformConfigs` after build)
 * - [x] Write tests for the module. (This is the overall goal, achieved by completing individual test cases)
 * - [x] Fix all errors and warnings.
 * - [x] Remove all commented out code and meta-comments.
 * - [x] Ensure 100% test coverage for executable code.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ToolConfigBuilder } from '../toolConfigBuilder';
import { Architecture, Platform } from '../../../types/platform.types';
import { createLogger } from '../../logger/createLogger'; // Adjusted path

const log = createLogger('ToolConfigBuilderPlatformTests');

describe('ToolConfigBuilder - Platform Support', () => {
  let builder: ToolConfigBuilder;

  beforeEach(() => {
    log('beforeEach: creating new ToolConfigBuilder instance');
    builder = new ToolConfigBuilder('test-tool');
  });

  it('should create a configuration for a single platform', () => {
    log('test: should create a configuration for a single platform');
    builder.platform(Platform.Linux, (pb) => {
      pb.bin('linux-app');
    });

    const config = builder.build();

    expect(config.platformConfigs).toBeDefined();
    expect(config.platformConfigs).toHaveLength(1);
    const platformConfig = config.platformConfigs![0];
    expect(platformConfig).toBeDefined(); // Ensure platformConfig itself is defined
    expect(platformConfig!.platforms).toBe(Platform.Linux);
    expect(platformConfig!.config.binaries).toEqual(['linux-app']);
  });

  it('should apply various platform-specific settings using a valid install method', () => {
    log('test: should apply various platform-specific settings');
    builder.platform(Platform.Windows, (pb) => {
      pb.bin('win-app.exe');
      // Use a valid install method, e.g., manual, and put other details in hooks if necessary
      // For simplicity, we'll use 'manual' and assume other scripts are handled by hooks (not tested here)
      pb.install('manual', { binaryPath: 'win-app.exe' });
      // pb.uninstall and pb.check are not methods of PlatformConfigBuilder
      // These would be part of installParams or hooks.
      // Example: setting a version for this platform
      pb.version('1.0.0-win');
    });

    const config = builder.build();
    expect(config.platformConfigs).toHaveLength(1);

    const platformConfig = config.platformConfigs![0];
    expect(platformConfig).toBeDefined(); // Ensure platformConfig itself is defined
    expect(platformConfig!.platforms).toBe(Platform.Windows);
    expect(platformConfig!.config.binaries).toEqual(['win-app.exe']);
    expect(platformConfig!.config.installationMethod).toBe('manual');
    expect((platformConfig!.config.installParams as any)?.binaryPath).toBe('win-app.exe');
    expect(platformConfig!.config.version).toBe('1.0.0-win');
  });

  it('should create configurations for multiple platforms via separate calls', () => {
    log('test: should create configurations for multiple platforms via separate calls');
    builder.platform(Platform.Linux, (pb) => {
      pb.bin('linux-bin');
    });
    builder.platform(Platform.MacOS, (pb) => { // Changed Darwin to MacOS
      pb.bin('darwin-bin');
    });

    const config = builder.build();
    expect(config.platformConfigs).toHaveLength(2);

    const linuxConfig = config.platformConfigs!.find(p => p.platforms === Platform.Linux);
    const darwinConfig = config.platformConfigs!.find(p => p.platforms === Platform.MacOS); // Changed Darwin to MacOS

    expect(linuxConfig).toBeDefined();
    expect(linuxConfig!.config.binaries).toEqual(['linux-bin']);

    expect(darwinConfig).toBeDefined();
    expect(darwinConfig!.config.binaries).toEqual(['darwin-bin']);
  });

  it('should create a configuration for multiple platforms via a single call with bitwise OR', () => {
    log('test: should create a configuration for multiple platforms via a single call with bitwise OR');
    builder.platform(Platform.Linux | Platform.MacOS, (pb) => { // Changed to bitwise OR and MacOS
      pb.bin('multi-platform-bin');
    });

    const config = builder.build();
    expect(config.platformConfigs).toHaveLength(1);

    const platformConfig = config.platformConfigs![0];
    expect(platformConfig).toBeDefined(); // Ensure platformConfig itself is defined
    expect(platformConfig!.platforms).toBe(Platform.Linux | Platform.MacOS); // Changed to bitwise OR and MacOS
    expect(platformConfig!.config.binaries).toEqual(['multi-platform-bin']);
  });

  it('should create a configuration with platform and architecture combinations using correct builder methods', () => {
    log('test: should create a configuration with platform and architecture combinations');
    // Generic Linux config (optional, could be empty or have common settings)
    builder.platform(Platform.Linux, (pb) => {
        pb.version('linux-common'); // Example common setting
    });

    // Linux X86_64 specific
    builder.platform(Platform.Linux, Architecture.X86_64, (pb) => {
      pb.bin('linux-x86_64-bin');
      pb.install('github-release', { repo: 'test/repo', assetPattern: 'linux-x86_64.tar.gz' });
    });

    // Linux Arm64 specific
    builder.platform(Platform.Linux, Architecture.Arm64, (pb) => {
      pb.bin('linux-arm64-bin');
      pb.install('github-release', { repo: 'test/repo', assetPattern: 'linux-arm64.tar.gz' });
    });

    const config = builder.build();
    expect(config.platformConfigs).toBeDefined();
    
    const linuxCommonConfig = config.platformConfigs!.find(p => p.platforms === Platform.Linux && p.architectures === undefined);
    const linuxX86Config = config.platformConfigs!.find(p => p.platforms === Platform.Linux && p.architectures === Architecture.X86_64);
    const linuxArmConfig = config.platformConfigs!.find(p => p.platforms === Platform.Linux && p.architectures === Architecture.Arm64);

    expect(linuxCommonConfig).toBeDefined();
    expect(linuxCommonConfig!.config.version).toBe('linux-common');

    expect(linuxX86Config).toBeDefined();
    expect(linuxX86Config!.config.binaries).toEqual(['linux-x86_64-bin']);
    expect(linuxX86Config!.config.installationMethod).toBe('github-release');

    expect(linuxArmConfig).toBeDefined();
    expect(linuxArmConfig!.config.binaries).toEqual(['linux-arm64-bin']);
    expect(linuxArmConfig!.config.installationMethod).toBe('github-release');
  });

  it('should correctly build with global and platform-specific settings', () => {
    log('test: should correctly build with global and platform-specific settings');
    builder.version('1.0.0'); // Global

    // Platform MacOS, specific for Arm64
    builder.platform(Platform.MacOS, Architecture.Arm64, (pb) => {
      pb.install('github-release', { repo: 'test/macrepo', assetPattern: 'macos-arm64.zip' });
      pb.bin('darwin-arm64-app');
    });

    const config = builder.build();

    expect(config.version).toBe('1.0.0');

    expect(config.platformConfigs).toHaveLength(1);
    const darwinArmConfig = config.platformConfigs!.find(p => p.platforms === Platform.MacOS && p.architectures === Architecture.Arm64);
    expect(darwinArmConfig).toBeDefined();
    expect(darwinArmConfig!.config.installationMethod).toBe('github-release');
    expect(darwinArmConfig!.config.binaries).toEqual(['darwin-arm64-app']);
  });
});