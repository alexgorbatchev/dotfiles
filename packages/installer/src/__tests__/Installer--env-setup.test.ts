import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import type { IInstallContext, ToolConfig } from '@dotfiles/core';
import type { IManualInstallSuccess } from '@dotfiles/installer-manual';
import { createInstallerTestSetup, type IInstallerTestSetup } from './installer-test-helpers';

describe('Installer - Environment Setup', () => {
  let setup: IInstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
  });

  it('should prepend stagingDir to PATH during installation', async () => {
    const toolName = 'path-test-tool';
    const toolConfig: ToolConfig = {
      name: toolName,
      version: '1.0.0',
      installationMethod: 'mock-method',
      installParams: {},
    } as unknown as ToolConfig;

    let pathDuringInstall: string | undefined;
    let stagingDir: string | undefined;

    spyOn(setup.pluginRegistry, 'install').mockImplementation(
      async (_parentLogger, _method, _name, _config, context: IInstallContext) => {
        pathDuringInstall = process.env['PATH'];
        stagingDir = context.stagingDir;
        return {
          success: true,
          binaryPaths: ['/fake/path'],
          version: '1.0.0',
          metadata: { method: 'manual', manualInstall: true },
        } as IManualInstallSuccess;
      }
    );

    const originalPath = process.env['PATH'];
    await setup.installer.install(toolName, toolConfig);

    expect(stagingDir).toBeDefined();
    expect(pathDuringInstall).toBeDefined();
    expect(pathDuringInstall?.startsWith(stagingDir!)).toBe(true);
    expect(pathDuringInstall).not.toBe(originalPath);

    // Verify PATH is restored
    expect(process.env['PATH']).toBe(originalPath);
  });
});
