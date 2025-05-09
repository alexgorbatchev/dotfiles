import { describe, it, expect } from 'bun:test';
import type {
  InstallHookContext,
  AsyncInstallHook,
  BaseInstallParams,
  GithubReleaseInstallParams,
  BrewInstallParams,
  CurlScriptInstallParams,
  CurlTarInstallParams,
  PipInstallParams,
  ManualInstallParams,
  InstallMethod,
  InstallParams,
  ToolConfigBuilder,
  AsyncConfigureTool,
  ToolConfig,
} from '../types';

describe('TypeScript Types', () => {
  it('should allow creating objects conforming to ToolConfig', () => {
    const mockHook: AsyncInstallHook = async (ctx: InstallHookContext) => {
      // Mock hook implementation
    };

    const sampleConfig: ToolConfig = {
      name: 'test-tool',
      binaries: ['tt'],
      version: '1.0.0',
      installMethod: 'github-release',
      installParams: {
        repo: 'owner/repo',
        assetPattern: '*.zip',
        hooks: {
          beforeInstall: mockHook,
        },
      },
      hooks: {
        beforeInstall: mockHook,
        afterDownload: async (ctx) => {
          // console.log(ctx.downloadPath); // Example usage, keep tests clean
        },
      },
      zshContent: ['alias tt="echo test"'],
      symlinks: [{ source: 'src/conf', target: '~/.config/conf' }],
    };

    expect(sampleConfig.name).toBe('test-tool');
    expect(sampleConfig.installMethod).toBe('github-release');
    expect(sampleConfig.hooks?.beforeInstall).toBeDefined();
    expect(sampleConfig.hooks?.afterDownload).toBeDefined();
    expect((sampleConfig.installParams as GithubReleaseInstallParams)?.repo).toBe('owner/repo');
  });

  it('should correctly type InstallMethod', () => {
    const method: InstallMethod = 'brew';
    expect(method).toBe('brew');
    // const invalidMethod: InstallMethod = 'invalid'; // This should cause a type error
  });

  // Add more tests here if specific type logic needs validation,
  // e.g., for type guards or complex conditional types.
  // For now, basic interface/type alias usage is implicitly tested by their successful compilation
  // and usage in other parts of the codebase (like ToolConfigBuilder tests).
});
