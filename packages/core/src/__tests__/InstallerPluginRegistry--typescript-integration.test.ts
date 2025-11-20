import { beforeEach, describe, expect, test } from 'bun:test';
import { TestLogger } from '@dotfiles/logger';
import { IToolConfigBuilder } from '@dotfiles/tool-config-builder';
import { z } from 'zod';
import { InstallerPluginRegistry } from '../InstallerPluginRegistry';
import type { IInstallerPlugin, InstallResult } from '../types';
// Import plugins to load type augmentations for this test
import '../plugins';

// Custom plugin schemas and types (simulating what a real plugin package would export)
const customNpmParamsSchema = z.object({
  packageName: z.string(),
  registryUrl: z.string().url().optional(),
  installGlobal: z.boolean().optional(),
});

const customNpmConfigSchema = z.object({
  installationMethod: z.literal('custom-npm'),
  installParams: customNpmParamsSchema,
  binaries: z.array(z.string()),
  name: z.string(),
  version: z.string(),
});

type CustomNpmParams = z.infer<typeof customNpmParamsSchema>;
type CustomNpmConfig = z.infer<typeof customNpmConfigSchema>;

// Module augmentation using inferred types (as plugin packages would do)
declare module '@dotfiles/core' {
  interface IToolConfigBuilder {
    install(method: 'custom-npm', params: CustomNpmParams): this;
  }
  interface IPlatformConfigBuilder {
    install(method: 'custom-npm', params: CustomNpmParams): this;
  }
}

describe('InstallerPluginRegistry - TypeScript Integration', () => {
  let logger: TestLogger;
  let registry: InstallerPluginRegistry;

  beforeEach(() => {
    logger = new TestLogger();
    registry = new InstallerPluginRegistry(logger);
  });

  test('IToolConfigBuilder with custom plugin method - TypeScript types work correctly', async () => {
    // Create a custom plugin using module-level schemas and types
    const customPlugin: IInstallerPlugin<'custom-npm', CustomNpmParams, CustomNpmConfig, { npmVersion: string }> = {
      method: 'custom-npm',
      displayName: 'Custom NPM Installer',
      version: '1.0.0',
      paramsSchema: customNpmParamsSchema,
      toolConfigSchema: customNpmConfigSchema,
      install: async () => {
        const result: InstallResult<{ npmVersion: string }> = {
          success: true,
          binaryPaths: ['/usr/local/bin/custom-tool'],
          metadata: { npmVersion: '1.0.0' },
        };
        return result;
      },
    };

    // Register plugin and compose schemas
    await registry.register(customPlugin);
    registry.composeSchemas();

    // Create IToolConfigBuilder with registry
    const builder = new IToolConfigBuilder(logger, 'my-custom-tool', registry);

    // Valid params - should work fine
    const config = builder
      .version('2.0.0')
      .bin('my-tool')
      .install('custom-npm', {
        packageName: '@myorg/my-tool',
        registryUrl: 'https://npm.example.com',
        installGlobal: true,
      })
      .build();

    // Verify the config was built correctly
    expect(config.name).toBe('my-custom-tool');
    expect(config.version).toBe('2.0.0');
    expect(config.binaries).toEqual(['my-tool']);

    // Verify registry validates the config successfully
    const schema = registry.getToolConfigSchema();
    const validationResult = schema.safeParse(config);
    expect(validationResult.success).toBe(true);
  });
});
