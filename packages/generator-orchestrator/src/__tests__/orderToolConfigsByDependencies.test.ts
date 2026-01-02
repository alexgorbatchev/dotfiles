import { describe, expect, test } from 'bun:test';
import type { ISystemInfo, ToolConfig } from '@dotfiles/core';
import { Architecture, Platform } from '@dotfiles/core';
import { TestLogger } from '@dotfiles/logger';
import { orderToolConfigsByDependencies } from '../orderToolConfigsByDependencies';

const systemInfoLinux: ISystemInfo = {
  platform: Platform.Linux,
  arch: Architecture.X86_64,
  homeDir: '/home/test',
};

type ManualToolConfigInput = {
  name: string;
  binaries?: string[];
  dependencies?: string[];
  platformConfigs?: ToolConfig['platformConfigs'];
};

function createManualToolConfig(input: ManualToolConfigInput): ToolConfig {
  const manualConfig: ToolConfig = {
    name: input.name,
    version: '1.0.0',
    installationMethod: 'manual',
    installParams: {},
    binaries: input.binaries,
    dependencies: input.dependencies,
    platformConfigs: input.platformConfigs,
  };
  return manualConfig;
}

describe('orderToolConfigsByDependencies', () => {
  test('returns original configuration when no dependencies are declared', () => {
    const providerConfig: ToolConfig = createManualToolConfig({
      name: 'provider',
      binaries: ['provider-bin'],
    });
    const consumerConfig: ToolConfig = createManualToolConfig({
      name: 'consumer',
      binaries: ['consumer-bin'],
    });

    const toolConfigs: Record<string, ToolConfig> = {
      provider: providerConfig,
      consumer: consumerConfig,
    };

    const logger = new TestLogger();
    const ordered = orderToolConfigsByDependencies(logger, toolConfigs, systemInfoLinux);
    expect(ordered).toBe(toolConfigs);
  });

  test('orders tools when dependencies are declared', () => {
    const providerConfig: ToolConfig = createManualToolConfig({
      name: 'provider',
      binaries: ['shared-bin'],
    });
    const consumerConfig: ToolConfig = createManualToolConfig({
      name: 'consumer',
      dependencies: ['shared-bin'],
    });

    const toolConfigs: Record<string, ToolConfig> = {
      consumer: consumerConfig,
      provider: providerConfig,
    };

    const logger = new TestLogger();
    const ordered = orderToolConfigsByDependencies(logger, toolConfigs, systemInfoLinux);
    const orderedToolNames: string[] = Object.keys(ordered);
    expect(orderedToolNames).toEqual(['provider', 'consumer']);
  });

  test('throws when dependency provider is not available on active platform', () => {
    const macOnlyBinaryConfig: ToolConfig = createManualToolConfig({
      name: 'mac-only',
      platformConfigs: [
        {
          platforms: Platform.MacOS,
          config: {
            binaries: ['mac-bin'],
          },
        },
      ],
    });
    const consumerConfig: ToolConfig = createManualToolConfig({
      name: 'consumer',
      dependencies: ['mac-bin'],
    });

    const toolConfigs: Record<string, ToolConfig> = {
      consumer: consumerConfig,
      'mac-only': macOnlyBinaryConfig,
    };

    const logger = new TestLogger();
    expect(() => orderToolConfigsByDependencies(logger, toolConfigs, systemInfoLinux)).toThrowError(
      'Dependency validation failed'
    );
    logger.expect(
      ['ERROR'],
      ['orderToolConfigsByDependencies'],
      ['Missing dependency: tool "consumer" requires binary "mac-bin" but no tool provides it for platform linux/x86_64.']
    );
  });

  test('throws when dependency is provided by multiple tools', () => {
    const providerAConfig: ToolConfig = createManualToolConfig({
      name: 'providerA',
      binaries: ['shared-bin'],
    });
    const providerBConfig: ToolConfig = createManualToolConfig({
      name: 'providerB',
      binaries: ['shared-bin'],
    });
    const consumerConfig: ToolConfig = createManualToolConfig({
      name: 'consumer',
      dependencies: ['shared-bin'],
    });

    const toolConfigs: Record<string, ToolConfig> = {
      consumer: consumerConfig,
      providerA: providerAConfig,
      providerB: providerBConfig,
    };

    const logger = new TestLogger();
    expect(() => orderToolConfigsByDependencies(logger, toolConfigs, systemInfoLinux)).toThrowError(
      'Dependency validation failed'
    );
    logger.expect(
      ['ERROR'],
      ['orderToolConfigsByDependencies'],
      [/Ambiguous dependency: binary "shared-bin" is provided by multiple tools/]
    );
  });

  test('throws when dependency graph contains a cycle', () => {
    const toolAConfig: ToolConfig = createManualToolConfig({
      name: 'toolA',
      binaries: ['bin-a'],
      dependencies: ['bin-b'],
    });
    const toolBConfig: ToolConfig = createManualToolConfig({
      name: 'toolB',
      binaries: ['bin-b'],
      dependencies: ['bin-a'],
    });

    const toolConfigs: Record<string, ToolConfig> = {
      toolA: toolAConfig,
      toolB: toolBConfig,
    };

    const logger = new TestLogger();
    expect(() => orderToolConfigsByDependencies(logger, toolConfigs, systemInfoLinux)).toThrowError(
      'Dependency validation failed'
    );
    logger.expect(['ERROR'], ['orderToolConfigsByDependencies'], [/Circular dependency detected between tools/]);
  });

  test('allows platform-specific providers for matching architecture', () => {
    const linuxArmProviderConfig: ToolConfig = createManualToolConfig({
      name: 'arm-provider',
      platformConfigs: [
        {
          platforms: Platform.Linux,
          architectures: Architecture.Arm64,
          config: {
            binaries: ['arm-bin'],
          },
        },
      ],
    });
    const linuxArmSystem: ISystemInfo = {
      platform: Platform.Linux,
      arch: Architecture.Arm64,
      homeDir: '/home/test-arm',
    };
    const consumerConfig: ToolConfig = createManualToolConfig({
      name: 'consumer',
      dependencies: ['arm-bin'],
    });

    const toolConfigs: Record<string, ToolConfig> = {
      consumer: consumerConfig,
      'arm-provider': linuxArmProviderConfig,
    };

    const logger = new TestLogger();
    const ordered = orderToolConfigsByDependencies(logger, toolConfigs, linuxArmSystem);
    const orderedToolNames: string[] = Object.keys(ordered);
    expect(orderedToolNames).toEqual(['arm-provider', 'consumer']);
  });
});
