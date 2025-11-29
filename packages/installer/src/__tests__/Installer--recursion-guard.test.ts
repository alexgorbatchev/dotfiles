import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import type { ToolConfig } from '@dotfiles/core';
import { createInstallerTestSetup, type IInstallerTestSetup } from './installer-test-helpers';

describe('Installer - Recursion Guard', () => {
  let setup: IInstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
  });

  it('should set the recursion guard environment variable during installation', async () => {
    const toolName = 'my-test-tool';
    const envVarName = 'DOTFILES_INSTALLING_MY_TEST_TOOL';

    const toolConfig: ToolConfig = {
      name: toolName,
      version: '1.0.0',
      installationMethod: 'mock-method' as any,
      installParams: {},
    } as unknown as ToolConfig;

    let envVarDuringInstall: string | undefined;

    // Mock plugin that captures the environment variable state during execution
    const installSpy = spyOn(setup.pluginRegistry, 'install').mockImplementation(async () => {
      envVarDuringInstall = process.env[envVarName];
      return {
        success: true,
        binaryPaths: [],
        version: '1.0.0',
        metadata: {},
      } as any;
    });

    // Execute installation
    await setup.installer.install(toolName, toolConfig);

    // Verify the env var was set during execution
    expect(envVarDuringInstall).toBe('true');

    // Verify the env var was cleaned up after execution
    expect(process.env[envVarName]).toBeUndefined();

    // Verify the plugin was actually called
    expect(installSpy).toHaveBeenCalled();
  });

  it('should handle tool names with hyphens correctly', async () => {
    const toolName = 'complex-tool-name-v2';
    const envVarName = 'DOTFILES_INSTALLING_COMPLEX_TOOL_NAME_V2';

    const toolConfig: ToolConfig = {
      name: toolName,
      version: '1.0.0',
      installationMethod: 'mock-method' as any,
      installParams: {},
    } as unknown as ToolConfig;

    let envVarDuringInstall: string | undefined;

    spyOn(setup.pluginRegistry, 'install').mockImplementation(async () => {
      envVarDuringInstall = process.env[envVarName];
      return {
        success: true,
        binaryPaths: [],
        version: '1.0.0',
        metadata: {},
      } as any;
    });

    await setup.installer.install(toolName, toolConfig);

    expect(envVarDuringInstall).toBe('true');
    expect(process.env[envVarName]).toBeUndefined();
  });

  it('should clean up environment variable even if installation fails', async () => {
    const toolName = 'failing-tool';
    const envVarName = 'DOTFILES_INSTALLING_FAILING_TOOL';

    const toolConfig: ToolConfig = {
      name: toolName,
      version: '1.0.0',
      installationMethod: 'mock-method' as any,
      installParams: {},
    } as unknown as ToolConfig;

    spyOn(setup.pluginRegistry, 'install').mockImplementation(async () => {
      throw new Error('Installation failed');
    });

    // Execute installation (which will fail)
    await setup.installer.install(toolName, toolConfig);

    // Verify the env var was cleaned up despite the error
    expect(process.env[envVarName]).toBeUndefined();
  });
});
