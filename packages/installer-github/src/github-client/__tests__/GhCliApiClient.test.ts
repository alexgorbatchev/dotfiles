import type { IGitHubRelease } from '@dotfiles/core';
import { Architecture, Platform } from '@dotfiles/core';
import type { ICache } from '@dotfiles/downloader';
import { createMemFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createMockProjectConfig, createTestDirectories, type PartialProjectConfig } from '@dotfiles/testing-helpers';
import { beforeEach, describe, expect, it, mock } from 'bun:test';
import path from 'node:path';
import { GhCliApiClient } from '../GhCliApiClient';
import { GitHubApiClientError } from '../GitHubApiClientError';
import { FIXTURE_RELEASE } from './fixtures/cacheTestFixtures';
import {
  createErrorResponse,
  createMockShellExecutor,
  createSuccessResponse,
  type IMockShellExecutor,
} from './helpers/createMockShellExecutor';

async function createTestProjectConfig(overrides: PartialProjectConfig = {}) {
  const memFs = await createMemFileSystem();
  const logger = new TestLogger();
  const testDirs = await createTestDirectories(logger, memFs.fs, { testName: 'ghcli-api-client' });

  return createMockProjectConfig({
    config: {
      paths: testDirs.paths,
      github: {
        cache: {
          enabled: false,
          ttl: 3600000,
        },
      },
      ...overrides,
    },
    filePath: path.join(testDirs.paths.dotfilesDir, 'config.ts'),
    fileSystem: memFs.fs,
    logger,
    systemInfo: { platform: Platform.Linux, arch: Architecture.X86_64, homeDir: testDirs.paths.homeDir, hostname: 'test-host' },
    env: {},
  });
}

function createMockCache(): ICache & {
  get: ReturnType<typeof mock<ICache['get']>>;
  set: ReturnType<typeof mock<ICache['set']>>;
} {
  return {
    get: mock(async () => null),
    set: mock(async () => {}),
    setDownload: mock(async () => {}),
    has: mock(async () => false),
    delete: mock(async () => {}),
    clearExpired: mock(async () => {}),
    clear: mock(async () => {}),
  };
}

describe('GhCliApiClient', () => {
  let mockShellExecutor: IMockShellExecutor;
  let logger: TestLogger;

  beforeEach(() => {
    mockShellExecutor = createMockShellExecutor();
    logger = new TestLogger();
  });

  describe('getLatestRelease', () => {
    it('should fetch and return the latest release', async () => {
      const projectConfig = await createTestProjectConfig();
      const client = new GhCliApiClient(logger, projectConfig, mockShellExecutor);

      mockShellExecutor.mockNextResponse(createSuccessResponse(FIXTURE_RELEASE));

      const release = await client.getLatestRelease('test-owner', 'test-repo');

      expect(release).toEqual(FIXTURE_RELEASE);
      expect(mockShellExecutor.execute).toHaveBeenCalledWith('gh', [
        'api',
        'repos/test-owner/test-repo/releases/latest',
      ]);
    });

    it('should return null if the release is not found (404)', async () => {
      const projectConfig = await createTestProjectConfig();
      const client = new GhCliApiClient(logger, projectConfig, mockShellExecutor);

      mockShellExecutor.mockNextResponse(createErrorResponse('gh: Not Found (HTTP 404)', 1));

      const release = await client.getLatestRelease('test-owner', 'test-repo');

      expect(release).toBeNull();
    });

    it('should throw GitHubApiClientError on rate limit', async () => {
      const projectConfig = await createTestProjectConfig();
      const client = new GhCliApiClient(logger, projectConfig, mockShellExecutor);

      mockShellExecutor.mockNextResponse(createErrorResponse('API rate limit exceeded', 1));

      expect(client.getLatestRelease('test-owner', 'test-repo')).rejects.toBeInstanceOf(GitHubApiClientError);
    });

    it('should throw GitHubApiClientError on parse error', async () => {
      const projectConfig = await createTestProjectConfig();
      const client = new GhCliApiClient(logger, projectConfig, mockShellExecutor);

      mockShellExecutor.mockNextResponse({
        stdout: 'not valid json',
        stderr: '',
        exitCode: 0,
      });

      expect(client.getLatestRelease('test-owner', 'test-repo')).rejects.toBeInstanceOf(GitHubApiClientError);
    });

    it('should use custom hostname for GitHub Enterprise', async () => {
      const projectConfig = await createTestProjectConfig({
        github: {
          host: 'https://api.github.enterprise.com',
          cache: {
            enabled: false,
            ttl: 3600000,
          },
        },
      });
      const client = new GhCliApiClient(logger, projectConfig, mockShellExecutor);

      mockShellExecutor.mockNextResponse(createSuccessResponse(FIXTURE_RELEASE));

      await client.getLatestRelease('test-owner', 'test-repo');

      expect(mockShellExecutor.execute).toHaveBeenCalledWith('gh', [
        'api',
        '--hostname',
        'github.enterprise.com',
        'repos/test-owner/test-repo/releases/latest',
      ]);
    });
  });

  describe('getReleaseByTag', () => {
    it('should fetch and return release by tag', async () => {
      const projectConfig = await createTestProjectConfig();
      const client = new GhCliApiClient(logger, projectConfig, mockShellExecutor);

      mockShellExecutor.mockNextResponse(createSuccessResponse(FIXTURE_RELEASE));

      const release = await client.getReleaseByTag('test-owner', 'test-repo', 'v1.0.0');

      expect(release).toEqual(FIXTURE_RELEASE);
      expect(mockShellExecutor.execute).toHaveBeenCalledWith('gh', [
        'api',
        'repos/test-owner/test-repo/releases/tags/v1.0.0',
      ]);
    });

    it('should return null if tag is not found', async () => {
      const projectConfig = await createTestProjectConfig();
      const client = new GhCliApiClient(logger, projectConfig, mockShellExecutor);

      mockShellExecutor.mockNextResponse(createErrorResponse('gh: Not Found (HTTP 404)', 1));

      const release = await client.getReleaseByTag('test-owner', 'test-repo', 'v999.0.0');

      expect(release).toBeNull();
    });
  });

  describe('getLatestReleaseTags', () => {
    it('should fetch and return latest release tags', async () => {
      const projectConfig = await createTestProjectConfig();
      const client = new GhCliApiClient(logger, projectConfig, mockShellExecutor);

      const mockReleases: IGitHubRelease[] = [
        { ...FIXTURE_RELEASE, tag_name: 'v3.0.0' },
        { ...FIXTURE_RELEASE, tag_name: 'v2.0.0' },
        { ...FIXTURE_RELEASE, tag_name: 'v1.0.0' },
      ];

      mockShellExecutor.mockNextResponse(createSuccessResponse(mockReleases));

      const tags = await client.getLatestReleaseTags('test-owner', 'test-repo', 3);

      expect(tags).toEqual(['v3.0.0', 'v2.0.0', 'v1.0.0']);
    });

    it('should return empty array on error', async () => {
      const projectConfig = await createTestProjectConfig();
      const client = new GhCliApiClient(logger, projectConfig, mockShellExecutor);

      mockShellExecutor.mockNextResponse(createErrorResponse('gh: error', 1));

      const tags = await client.getLatestReleaseTags('test-owner', 'test-repo');

      expect(tags).toEqual([]);
    });
  });

  describe('probeLatestTag', () => {
    it('should return latest tag via getLatestRelease', async () => {
      const projectConfig = await createTestProjectConfig();
      const client = new GhCliApiClient(logger, projectConfig, mockShellExecutor);

      mockShellExecutor.mockNextResponse(createSuccessResponse(FIXTURE_RELEASE));

      const tag = await client.probeLatestTag('test-owner', 'test-repo');

      expect(tag).toBe('v1.0.0');
    });

    it('should return null on error', async () => {
      const projectConfig = await createTestProjectConfig();
      const client = new GhCliApiClient(logger, projectConfig, mockShellExecutor);

      mockShellExecutor.mockNextResponse(createErrorResponse('gh: error', 1));

      const tag = await client.probeLatestTag('test-owner', 'test-repo');

      expect(tag).toBeNull();
    });
  });

  describe('caching', () => {
    it('should return cached data when available', async () => {
      const projectConfig = await createTestProjectConfig({
        github: {
          cache: {
            enabled: true,
            ttl: 3600000,
          },
        },
      });
      const mockCache = createMockCache();
      mockCache.get.mockResolvedValue(FIXTURE_RELEASE);

      const client = new GhCliApiClient(logger, projectConfig, mockShellExecutor, mockCache);

      const release = await client.getLatestRelease('test-owner', 'test-repo');

      expect(release).toEqual(FIXTURE_RELEASE);
      expect(mockCache.get).toHaveBeenCalled();
      expect(mockShellExecutor.execute).not.toHaveBeenCalled();
    });

    it('should fetch and cache data on cache miss', async () => {
      const projectConfig = await createTestProjectConfig({
        github: {
          cache: {
            enabled: true,
            ttl: 3600000,
          },
        },
      });
      const mockCache = createMockCache();
      mockCache.get.mockResolvedValue(null);

      mockShellExecutor.mockNextResponse(createSuccessResponse(FIXTURE_RELEASE));

      const client = new GhCliApiClient(logger, projectConfig, mockShellExecutor, mockCache);

      const release = await client.getLatestRelease('test-owner', 'test-repo');

      expect(release).toEqual(FIXTURE_RELEASE);
      expect(mockCache.get).toHaveBeenCalled();
      expect(mockShellExecutor.execute).toHaveBeenCalled();
      expect(mockCache.set).toHaveBeenCalledWith(
        expect.stringContaining('GET:/repos/test-owner/test-repo/releases/latest'),
        FIXTURE_RELEASE,
        3600000,
      );
    });

    it('should not use cache when disabled', async () => {
      const projectConfig = await createTestProjectConfig({
        github: {
          cache: {
            enabled: false,
            ttl: 3600000,
          },
        },
      });
      const mockCache = createMockCache();

      mockShellExecutor.mockNextResponse(createSuccessResponse(FIXTURE_RELEASE));

      const client = new GhCliApiClient(logger, projectConfig, mockShellExecutor, mockCache);

      await client.getLatestRelease('test-owner', 'test-repo');

      expect(mockCache.get).not.toHaveBeenCalled();
      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('should handle cache errors gracefully', async () => {
      const projectConfig = await createTestProjectConfig({
        github: {
          cache: {
            enabled: true,
            ttl: 3600000,
          },
        },
      });
      const mockCache = createMockCache();
      mockCache.get.mockRejectedValue(new Error('Cache read error'));
      mockCache.set.mockRejectedValue(new Error('Cache write error'));

      mockShellExecutor.mockNextResponse(createSuccessResponse(FIXTURE_RELEASE));

      const client = new GhCliApiClient(logger, projectConfig, mockShellExecutor, mockCache);

      const release = await client.getLatestRelease('test-owner', 'test-repo');

      expect(release).toEqual(FIXTURE_RELEASE);
      expect(mockShellExecutor.execute).toHaveBeenCalled();
    });
  });
});
