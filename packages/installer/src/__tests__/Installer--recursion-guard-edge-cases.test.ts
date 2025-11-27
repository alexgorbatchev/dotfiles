import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import type { ToolConfig } from '@dotfiles/core';
import {
  createInstallerTestSetup,
  type IInstallerTestSetup,
} from './installer-test-helpers';

describe('Installer - Recursion Guard Edge Cases', () => {
  let setup: IInstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
  });

  it('should handle tool names with dots and other special characters', async () => {
    const toolName = 'my.cool-tool@v2';
    // Expected: MY_COOL_TOOL_V2
    const envVarName = 'DOTFILES_INSTALLING_MY_COOL_TOOL_V2';
    
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
});
