import type { IInstallContext, ToolConfig } from '@dotfiles/core';
import type { IManualInstallSuccess } from '@dotfiles/installer-manual';
import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createInstallerTestSetup, type IInstallerTestSetup } from './installer-test-helpers';

describe('Installer - Environment Setup', () => {
  let setup: IInstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
  });

  it('should prepend stagingDir to PATH in shell environment during installation', async () => {
    const toolName = 'path-test-tool';
    const toolConfig: ToolConfig = {
      name: toolName,
      version: '1.0.0',
      installationMethod: 'mock-method',
      installParams: {},
    } as unknown as ToolConfig;

    let pathSeenByShell: string | undefined;
    let stagingDir: string | undefined;

    spyOn(setup.pluginRegistry, 'install').mockImplementation(
      async (_parentLogger, _method, _name, _config, context: IInstallContext) => {
        stagingDir = context.stagingDir;
        // Check the PATH via shell environment - this is what matters for finding binaries
        const result = await context.$`printenv PATH || true`.quiet();
        pathSeenByShell = result.stdout.trim() || undefined;
        return {
          success: true,
          binaryPaths: ['/fake/path'],
          version: '1.0.0',
          metadata: { method: 'manual', manualInstall: true },
        } as IManualInstallSuccess;
      },
    );

    const originalPath = process.env['PATH'];
    await setup.installer.install(toolName, toolConfig);

    expect(stagingDir).toBeDefined();
    expect(pathSeenByShell).toBeDefined();
    expect(pathSeenByShell?.startsWith(stagingDir!)).toBe(true);
    expect(pathSeenByShell).not.toBe(originalPath);

    // process.env should NOT be modified (we use shell environment instead)
    expect(process.env['PATH']).toBe(originalPath);
  });
});
