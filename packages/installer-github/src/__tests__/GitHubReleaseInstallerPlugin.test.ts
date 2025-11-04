import { beforeEach, describe, expect, it } from 'bun:test';
import type { GithubReleaseToolConfig } from '@dotfiles/schemas';
import { GitHubReleaseInstallerPlugin } from '../GitHubReleaseInstallerPlugin';
import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type { YamlConfig } from '@dotfiles/config';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { HookExecutor, IGitHubApiClient } from '@dotfiles/installer';

describe('GitHubReleaseInstallerPlugin', () => {
  let plugin: GitHubReleaseInstallerPlugin;
  let mockFs: IFileSystem;
  let mockDownloader: IDownloader;
  let mockGitHubClient: IGitHubApiClient;
  let mockArchiveExtractor: IArchiveExtractor;
  let mockAppConfig: YamlConfig;
  let mockHookExecutor: HookExecutor;

  beforeEach(() => {
    mockFs = {} as IFileSystem;
    mockDownloader = {} as IDownloader;
    mockGitHubClient = {} as IGitHubApiClient;
    mockArchiveExtractor = {} as IArchiveExtractor;
    mockAppConfig = {} as YamlConfig;
    mockHookExecutor = {} as HookExecutor;
    
    plugin = new GitHubReleaseInstallerPlugin(
      mockFs,
      mockDownloader,
      mockGitHubClient,
      mockArchiveExtractor,
      mockAppConfig,
      mockHookExecutor
    );
  });

  it('should have correct plugin metadata', () => {
    expect(plugin.method).toBe('github-release');
    expect(plugin.displayName).toBe('GitHub Release');
    expect(plugin.version).toBe('1.0.0');
  });

  it('should have valid schemas', () => {
    expect(plugin.paramsSchema).toBeDefined();
    expect(plugin.toolConfigSchema).toBeDefined();
  });

  it('should validate correct params', () => {
    const validParams = {
      repo: 'owner/repo',
    };

    const result = plugin.paramsSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it('should validate correct tool config', () => {
    const validConfig: GithubReleaseToolConfig = {
      name: 'test-tool',
      version: '1.0.0',
      binaries: ['test-tool'],
      installationMethod: 'github-release',
      installParams: {
        repo: 'owner/repo',
      },
    };

    const result = plugin.toolConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it('should reject invalid tool config', () => {
    const invalidConfig = {
      name: 'test-tool',
      version: '1.0.0',
      binaries: ['test-tool'],
      installationMethod: 'github-release',
      installParams: {
        invalidParam: 'value',
      },
    };

    const result = plugin.toolConfigSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });
});
