import type { ProjectConfig } from '@dotfiles/config';
import {
  Architecture,
  createShell,
  InstallerPluginRegistry,
  type ISystemInfo,
  Platform,
  type ToolConfig,
} from '@dotfiles/core';
import { NodeFileSystem, ResolvedFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import type { IToolInstallationRegistry } from '@dotfiles/registry/tool';
import { SymlinkGenerator } from '@dotfiles/symlink-generator';
import { createTestDirectories, type ITestDirectories } from '@dotfiles/testing-helpers';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import assert from 'node:assert';
import path from 'node:path';
import { z } from 'zod';
import { Installer } from '../Installer';
import { HookExecutor } from '../utils/HookExecutor';

describe('Installer - Path Precedence (Real FS)', () => {
  let logger: TestLogger;
  let fileSystem: NodeFileSystem;
  let testDirs: ITestDirectories;

  beforeEach(async () => {
    logger = new TestLogger();
    fileSystem = new NodeFileSystem();
    testDirs = await createTestDirectories(logger, fileSystem, {
      testName: 'installer-path-precedence',
    });
  });

  afterEach(async () => {
    await fileSystem.rm(testDirs.paths.homeDir, { recursive: true, force: true });
  });

  it('should execute the newly installed binary instead of the shim during installation', async () => {
    // 1. Setup Real Temp Environment
    const binDir = testDirs.paths.targetDir; // Shim dir

    // 2. Create Shim
    const toolName = 'real-fs-test-tool';
    const shimPath = path.join(binDir, toolName);
    // Create a fake shim that echoes "SHIM"
    await fileSystem.writeFile(shimPath, `#!/bin/sh\necho "SHIM"`);
    await fileSystem.chmod(shimPath, 0o755);

    // 3. Setup Installer Dependencies
    const projectConfig = {
      paths: testDirs.paths,
    } as unknown as ProjectConfig;

    const registry = new InstallerPluginRegistry(logger);

    // Mock the plugin
    registry.register({
      method: 'mock',
      displayName: 'Mock Plugin',
      version: '1.0.0',
      paramsSchema: z.object({}),
      toolConfigSchema: z.object({}),
      install: async (_name, _config, context) => {
        // Create Real Binary in the install directory
        const binaryPath = path.join(context.stagingDir, toolName);
        await fileSystem.writeFile(binaryPath, `#!/bin/sh\necho "REAL_BINARY"`);
        await fileSystem.chmod(binaryPath, 0o755);

        // Execute the tool using bun shell
        // This should pick up the binary from stagingDir because Installer prepends it to PATH
        try {
          // Use the shell from context which should be configured with the correct environment
          const $ = context.$;

          // Let's try executing via `sh -c` to force PATH resolution
          // We don't need to manually pass .env() anymore because context.$ is configured
          const output = await $`sh -c ${toolName}`.text();
          return {
            success: true,
            binaryPaths: [binaryPath],
            version: '1.0.0',
            metadata: { output: output.trim() },
          };
        } catch (error) {
          // If shell fails, it might be because it found the shim and the shim failed (recursion guard)
          // Or it didn't find anything.
          // If it found the shim, it would exit 1 (recursion guard).
          // If it found the real binary, it should exit 0.

          // Let's try to debug why it failed
          return {
            success: false,
            error: String(error),
            metadata: {},
          };
        }
      },
    });

    // Mock ToolInstallationRegistry
    const toolRegistry: IToolInstallationRegistry = {
      getToolInstallation: async () => null,
      recordToolInstallation: async () => {},
      getAllToolInstallations: async () => [],
      updateToolInstallation: async () => {},
      removeToolInstallation: async () => {},
      isToolInstalled: async () => false,
      close: async () => {},
    };

    const systemInfo: ISystemInfo = {
      platform: Platform.MacOS,
      arch: Architecture.Arm64,
      homeDir: testDirs.paths.homeDir,
      hostname: 'test-host',
    };
    const symlinkGenerator = new SymlinkGenerator(logger, fileSystem, projectConfig, systemInfo);
    const hookExecutor = new HookExecutor((): void => {});
    const resolvedFs = new ResolvedFileSystem(fileSystem, testDirs.paths.homeDir);

    const installer = new Installer(
      logger,
      fileSystem,
      resolvedFs,
      projectConfig,
      toolRegistry,
      systemInfo,
      registry,
      symlinkGenerator,
      createShell(),
      hookExecutor,
    );

    // 4. Run Install with Modified PATH
    // We add the shim dir to the PATH to simulate the scenario where the shim exists in the system PATH
    const originalPath = process.env['PATH'] || '';
    process.env['PATH'] = `${binDir}${path.delimiter}${originalPath}`;

    try {
      const result = await installer.install(toolName, {
        name: toolName,
        version: '1.0.0',
        installationMethod: 'mock',
        installParams: {},
      } as unknown as ToolConfig);

      assert.ok(result.success);

      // Verify that the output came from the real binary, not the shim
      expect((result.metadata as { output?: string; }).output).toBe('REAL_BINARY');
    } finally {
      process.env['PATH'] = originalPath;
    }
  });
});
