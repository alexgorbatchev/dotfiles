import {
  Architecture,
  type IGitHubRelease,
  type IGitHubReleaseAsset,
  type IInstallContext,
  Platform,
} from '@dotfiles/core';
import type { GithubReleaseInstallParams } from '@dotfiles/installer-github';
import { TestLogger } from '@dotfiles/logger';
import { beforeEach, describe, expect, it } from 'bun:test';
import assert from 'node:assert';
import { selectAsset } from '../installFromGitHubRelease';

function createMockAsset(name: string): IGitHubReleaseAsset {
  const asset: IGitHubReleaseAsset = {
    name,
    content_type: 'application/gzip',
    size: 1024,
    download_count: 100,
    browser_download_url: `https://github.com/neovim/neovim/releases/download/v0.10.0/${name}`,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    state: 'uploaded',
  };
  return asset;
}

function createNeovimRelease(): IGitHubRelease {
  const release: IGitHubRelease = {
    id: 1,
    tag_name: 'v0.10.0',
    name: 'Neovim 0.10.0',
    draft: false,
    prerelease: false,
    created_at: '2024-01-01T00:00:00Z',
    published_at: '2024-01-01T00:00:00Z',
    html_url: 'https://github.com/neovim/neovim/releases/tag/v0.10.0',
    assets: [
      createMockAsset('nvim-linux-arm64.appimage'),
      createMockAsset('nvim-linux-arm64.appimage.zsync'),
      createMockAsset('nvim-linux-arm64.tar.gz'),
      createMockAsset('nvim-linux-x86_64.appimage'),
      createMockAsset('nvim-linux-x86_64.appimage.zsync'),
      createMockAsset('nvim-linux-x86_64.tar.gz'),
      createMockAsset('nvim-macos-arm64.tar.gz'),
      createMockAsset('nvim-macos-x86_64.tar.gz'),
      createMockAsset('nvim-win-arm64.msi'),
      createMockAsset('nvim-win-arm64.zip'),
      createMockAsset('nvim-win64.msi'),
      createMockAsset('nvim-win64.zip'),
    ],
  };
  return release;
}

function createMacOSArm64Context(): IInstallContext {
  return {
    toolName: 'nvim',
    currentDir: '/path/to/tools/nvim',
    stagingDir: '/path/to/tools/nvim/.staging',
    systemInfo: {
      platform: Platform.MacOS,
      arch: Architecture.Arm64,
      homeDir: '/Users/test',
    },
  } as IInstallContext;
}

function createMacOSx64Context(): IInstallContext {
  return {
    toolName: 'nvim',
    currentDir: '/path/to/tools/nvim',
    stagingDir: '/path/to/tools/nvim/.staging',
    systemInfo: {
      platform: Platform.MacOS,
      arch: Architecture.X86_64,
      homeDir: '/Users/test',
    },
  } as IInstallContext;
}

function createLinuxArm64Context(): IInstallContext {
  return {
    toolName: 'nvim',
    currentDir: '/path/to/tools/nvim',
    stagingDir: '/path/to/tools/nvim/.staging',
    systemInfo: {
      platform: Platform.Linux,
      arch: Architecture.Arm64,
      homeDir: '/home/test',
    },
  } as IInstallContext;
}

function createLinuxx64Context(): IInstallContext {
  return {
    toolName: 'nvim',
    currentDir: '/path/to/tools/nvim',
    stagingDir: '/path/to/tools/nvim/.staging',
    systemInfo: {
      platform: Platform.Linux,
      arch: Architecture.X86_64,
      homeDir: '/home/test',
    },
  } as IInstallContext;
}

describe('selectAsset', () => {
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger();
  });

  describe('assetPattern with platform filtering', () => {
    it('should select macos-arm64 asset when pattern is *.tar.gz and platform is macOS arm64', async () => {
      const release = createNeovimRelease();
      const context = createMacOSArm64Context();
      const params: GithubReleaseInstallParams = {
        repo: 'neovim/neovim',
        assetPattern: '*.tar.gz',
      };

      const result = await selectAsset(release, params, context, logger);

      assert(result.success);
      expect(result.data.name).toBe('nvim-macos-arm64.tar.gz');
    });

    it('should select macos-x86_64 asset when pattern is *.tar.gz and platform is macOS x64', async () => {
      const release = createNeovimRelease();
      const context = createMacOSx64Context();
      const params: GithubReleaseInstallParams = {
        repo: 'neovim/neovim',
        assetPattern: '*.tar.gz',
      };

      const result = await selectAsset(release, params, context, logger);

      assert(result.success);
      expect(result.data.name).toBe('nvim-macos-x86_64.tar.gz');
    });

    it('should select linux-arm64 asset when pattern is *.tar.gz and platform is Linux arm64', async () => {
      const release = createNeovimRelease();
      const context = createLinuxArm64Context();
      const params: GithubReleaseInstallParams = {
        repo: 'neovim/neovim',
        assetPattern: '*.tar.gz',
      };

      const result = await selectAsset(release, params, context, logger);

      assert(result.success);
      expect(result.data.name).toBe('nvim-linux-arm64.tar.gz');
    });

    it('should select linux-x86_64 asset when pattern is *.tar.gz and platform is Linux x64', async () => {
      const release = createNeovimRelease();
      const context = createLinuxx64Context();
      const params: GithubReleaseInstallParams = {
        repo: 'neovim/neovim',
        assetPattern: '*.tar.gz',
      };

      const result = await selectAsset(release, params, context, logger);

      assert(result.success);
      expect(result.data.name).toBe('nvim-linux-x86_64.tar.gz');
    });
  });

  describe('assetPattern without platform match', () => {
    it('should return first matching asset when no platform-specific asset exists', async () => {
      const release: IGitHubRelease = {
        ...createNeovimRelease(),
        assets: [
          createMockAsset('tool-universal.tar.gz'),
          createMockAsset('tool-source.tar.gz'),
        ],
      };
      const context = createMacOSArm64Context();
      const params: GithubReleaseInstallParams = {
        repo: 'owner/repo',
        assetPattern: '*.tar.gz',
      };

      const result = await selectAsset(release, params, context, logger);

      assert(result.success);
      expect(result.data.name).toBe('tool-universal.tar.gz');
    });
  });

  describe('no assetPattern - platform-only selection', () => {
    it('should select platform-specific asset without assetPattern', async () => {
      const release = createNeovimRelease();
      const context = createMacOSArm64Context();
      const params: GithubReleaseInstallParams = {
        repo: 'neovim/neovim',
      };

      const result = await selectAsset(release, params, context, logger);

      assert(result.success);
      expect(result.data.name).toBe('nvim-macos-arm64.tar.gz');
    });
  });
});
