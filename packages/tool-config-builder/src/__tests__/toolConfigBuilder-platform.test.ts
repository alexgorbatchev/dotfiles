import { beforeEach, describe, expect, it } from 'bun:test';
import { Architecture, Platform } from '@dotfiles/core';
import { TestLogger } from '@dotfiles/logger';
import { messages } from '../log-messages';
import { IToolConfigBuilder } from '../toolConfigBuilder';

describe('IToolConfigBuilder - Platform Support', () => {
  let builder: IToolConfigBuilder;
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger();
    builder = new IToolConfigBuilder(logger, 'test-tool');
  });

  it('should create a configuration for a single platform', () => {
    builder.platform(Platform.Linux, (install) => {
      return install('manual', { binaryPath: 'linux-app' }).bin('linux-app') as unknown as IToolConfigBuilder;
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
    builder.platform(Platform.Windows, (install) => {
      return install('manual', { binaryPath: 'win-app.exe' }).bin('win-app.exe').version('1.0.0-win');
    });

    const config = builder.build();
    expect(config.platformConfigs).toHaveLength(1);

    const platformConfig = config.platformConfigs![0];
    expect(platformConfig).toBeDefined(); // Ensure platformConfig itself is defined
    expect(platformConfig!.platforms).toBe(Platform.Windows);
    expect(platformConfig!.config.binaries).toEqual(['win-app.exe']);
    expect(platformConfig!.config.version).toBe('1.0.0-win');
  });

  it('should create configurations for multiple platforms via separate calls', () => {
    builder.platform(Platform.Linux, (install) => {
      return install('manual', { binaryPath: 'linux-bin' }).bin('linux-bin') as unknown as IToolConfigBuilder;
    });
    builder.platform(Platform.MacOS, (install) => {
      // Changed Darwin to MacOS
      return install('manual', { binaryPath: 'darwin-bin' }).bin('darwin-bin') as unknown as IToolConfigBuilder;
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
    builder.platform(Platform.Linux | Platform.MacOS, (install) => {
      // Changed to bitwise OR and MacOS
      return install('manual', { binaryPath: 'multi-platform-bin' }).bin(
        'multi-platform-bin'
      ) as unknown as IToolConfigBuilder;
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
    builder.platform(Platform.Linux, (install) => {
      return install('manual', { binaryPath: 'linux-common-bin' })
        .version('linux-common') // Example common setting
        .bin('linux-common-bin') as unknown as IToolConfigBuilder; // Ensure at least one binary is set for platform config
    });

    // Linux X86_64 specific
    builder.platform(Platform.Linux, Architecture.X86_64, (install) => {
      return install('github-release', { repo: 'test/repo', assetPattern: 'linux-x86_64.tar.gz' }).bin(
        'linux-x86_64-bin'
      ) as unknown as IToolConfigBuilder;
    });

    // Linux Arm64 specific
    builder.platform(Platform.Linux, Architecture.Arm64, (install) => {
      return install('github-release', { repo: 'test/repo', assetPattern: 'linux-arm64.tar.gz' }).bin(
        'linux-arm64-bin'
      ) as unknown as IToolConfigBuilder;
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

    expect(linuxArmConfig).toBeDefined();
    expect(linuxArmConfig!.config.binaries).toEqual(['linux-arm64-bin']);
  });

  it('should correctly build with global and platform-specific settings', () => {
    builder.version('1.0.0'); // Global

    // Platform MacOS, specific for Arm64
    builder.platform(Platform.MacOS, Architecture.Arm64, (install) => {
      return install('github-release', { repo: 'test/macrepo', assetPattern: 'macos-arm64.zip' }).bin(
        'darwin-arm64-app'
      ) as unknown as IToolConfigBuilder;
    });

    const config = builder.build();

    expect(config.version).toBe('1.0.0');

    expect(config.platformConfigs).toHaveLength(1);
    const darwinArmConfig = config.platformConfigs!.find(
      (p) => p.platforms === Platform.MacOS && p.architectures === Architecture.Arm64
    );
    expect(darwinArmConfig).toBeDefined();
    expect(darwinArmConfig!.config.binaries).toEqual(['darwin-arm64-app']);
    expect(darwinArmConfig!.config.binaries).toEqual(['darwin-arm64-app']);
  });

  it('should log error when platform() called with architecture but no configure callback', () => {
    const testLogger = new TestLogger();
    const testBuilder = new IToolConfigBuilder(testLogger, 'test-tool');

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
      ['IToolConfigBuilder'],
      [],
      [
        messages.configurationFieldRequired(
          'configure callback',
          'platform() called for tool "test-tool" with architectures but without a configure callback'
        ),
      ]
    );
  });
});
