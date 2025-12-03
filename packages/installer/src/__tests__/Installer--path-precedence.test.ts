import { afterEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ProjectConfig } from '@dotfiles/config';
import { InstallerPluginRegistry } from '@dotfiles/core';
import { NodeFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { SymlinkGenerator } from '@dotfiles/symlink-generator';
import { $ } from 'bun';
import { z } from 'zod';
import { Installer } from '../Installer';

describe('Installer - Path Precedence (Real FS)', () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should execute the newly installed binary instead of the shim during installation', async () => {
    // 1. Setup Real Temp Environment
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'installer-test-'));
    const binDir = path.join(tempDir, 'bin'); // Shim dir
    const generatedDir = path.join(tempDir, 'generated');
    const installDirBase = path.join(generatedDir, 'binaries');

    await fs.mkdir(binDir, { recursive: true });

    // 2. Create Shim
    const toolName = 'real-fs-test-tool';
    const shimPath = path.join(binDir, toolName);
    // Create a fake shim that echoes "SHIM"
    await fs.writeFile(shimPath, `#!/bin/sh\necho "SHIM"`);
    await fs.chmod(shimPath, 0o755);

    // 3. Setup Installer Dependencies
    const logger = new TestLogger();
    const fileSystem = new NodeFileSystem();
    const projectConfig = {
      paths: {
        generatedDir,
        targetDir: binDir,
        binariesDir: installDirBase,
        homeDir: tempDir,
        shellScriptsDir: path.join(tempDir, 'scripts'),
        dotfilesDir: path.join(tempDir, 'dotfiles'),
      },
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
        const binaryPath = path.join(context.installDir, toolName);
        await fs.writeFile(binaryPath, `#!/bin/sh\necho "REAL_BINARY"`);
        await fs.chmod(binaryPath, 0o755);

        // Execute the tool using bun shell
        // This should pick up the binary from installDir because Installer prepends it to PATH
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
    const toolRegistry = {
      getToolInstallation: async () => null,
      recordToolInstallation: async () => {},
    } as any;

    const systemInfo = { platform: 'darwin', arch: 'arm64' } as any;
    const symlinkGenerator = new SymlinkGenerator(logger, fileSystem, projectConfig, systemInfo);

    const installer = new Installer(
      logger,
      fileSystem,
      projectConfig,
      toolRegistry,
      systemInfo,
      registry,
      symlinkGenerator,
      $
    );

    // 4. Run Install with Modified PATH
    // We add the shim dir to the PATH to simulate the scenario where the shim exists in the system PATH
    const originalPath = process.env['PATH'] || '';
    process.env['PATH'] = `${binDir}${path.delimiter}${originalPath}`;

    try {
      const result = await installer.install(toolName, {
        name: toolName,
        version: '1.0.0',
        installationMethod: 'mock' as any,
        installParams: {},
      });

      if (!result.success) {
        console.error('Install failed:', result.error);
      }

      expect(result.success).toBe(true);
      // Verify that the output came from the real binary, not the shim
      expect((result as any).metadata.output).toBe('REAL_BINARY');
    } finally {
      process.env['PATH'] = originalPath;
    }
  });
});
