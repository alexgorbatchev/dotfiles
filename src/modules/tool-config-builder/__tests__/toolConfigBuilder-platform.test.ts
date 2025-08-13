import { beforeEach, describe, expect, it } from 'bun:test';
import { logs } from '@modules/logger';
import { TestLogger } from '@testing-helpers';
import type { ManualInstallParams } from '@types';
import { Architecture, Platform } from '@types';
import { ToolConfigBuilder } from '../toolConfigBuilder';

describe('ToolConfigBuilder - Platform Support', () => {
  let builder: ToolConfigBuilder;
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger();
    builder = new ToolConfigBuilder(logger, 'test-tool');
  });

  it('should create a configuration for a single platform', () => {
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
    expect((platformConfig!.config.installParams as ManualInstallParams)?.binaryPath).toBe('win-app.exe');
    expect(platformConfig!.config.version).toBe('1.0.0-win');
  });

  it('should create configurations for multiple platforms via separate calls', () => {
    builder.platform(Platform.Linux, (pb) => {
      pb.bin('linux-bin');
    });
    builder.platform(Platform.MacOS, (pb) => {
      // Changed Darwin to MacOS
      pb.bin('darwin-bin');
    });

    const config = builder.build();
    expect(config.platformConfigs).toHaveLength(2);

    const linuxConfig = config.platformConfigs!.find((p) => p.platforms === Platform.Linux);
    const darwinConfig = config.platformConfigs!.find((p) => p.platforms === Platform.MacOS); // Changed Darwin to MacOS

    expect(linuxConfig).toBeDefined();
    expect(linuxConfig!.config.binaries).toEqual(['linux-bin']);

    expect(darwinConfig).toBeDefined();
    expect(darwinConfig!.config.binaries).toEqual(['darwin-bin']);
  });

  it('should create a configuration for multiple platforms via a single call with bitwise OR', () => {
    builder.platform(Platform.Linux | Platform.MacOS, (pb) => {
      // Changed to bitwise OR and MacOS
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
    // Generic Linux config (optional, could be empty or have common settings)
    builder.platform(Platform.Linux, (pb) => {
      pb.version('linux-common'); // Example common setting
      pb.bin('linux-common-bin'); // Ensure at least one binary is set for platform config
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

    const linuxCommonConfig = config.platformConfigs!.find(
      (p) => p.platforms === Platform.Linux && p.architectures === undefined
    );
    const linuxX86Config = config.platformConfigs!.find(
      (p) => p.platforms === Platform.Linux && p.architectures === Architecture.X86_64
    );
    const linuxArmConfig = config.platformConfigs!.find(
      (p) => p.platforms === Platform.Linux && p.architectures === Architecture.Arm64
    );

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
    builder.version('1.0.0'); // Global

    // Platform MacOS, specific for Arm64
    builder.platform(Platform.MacOS, Architecture.Arm64, (pb) => {
      pb.install('github-release', { repo: 'test/macrepo', assetPattern: 'macos-arm64.zip' });
      pb.bin('darwin-arm64-app');
    });

    const config = builder.build();

    expect(config.version).toBe('1.0.0');

    expect(config.platformConfigs).toHaveLength(1);
    const darwinArmConfig = config.platformConfigs!.find(
      (p) => p.platforms === Platform.MacOS && p.architectures === Architecture.Arm64
    );
    expect(darwinArmConfig).toBeDefined();
    expect(darwinArmConfig!.config.installationMethod).toBe('github-release');
    expect(darwinArmConfig!.config.binaries).toEqual(['darwin-arm64-app']);
  });

  it('should log error when platform() called with architecture but no configure callback', () => {
    const testLogger = new TestLogger();
    const testBuilder = new ToolConfigBuilder(testLogger, 'test-tool');

    let thrownError: Error | null = null;
    try {
      // Call platform with architecture but explicitly pass undefined as callback
      testBuilder.platform(Platform.Linux, Architecture.X86_64, undefined);
    } catch (error) {
      thrownError = error as Error;
    }

    expect(thrownError).toBeInstanceOf(Error);
    expect(thrownError!.message).toContain('Required configuration missing: configure callback');

    testLogger.expect(
      ['ERROR'],
      ['ToolConfigBuilder'],
      [
        logs.config.error.required(
          'configure callback',
          'platform() called for tool "test-tool" with architectures but without a configure callback'
        ),
      ]
    );
  });
});
