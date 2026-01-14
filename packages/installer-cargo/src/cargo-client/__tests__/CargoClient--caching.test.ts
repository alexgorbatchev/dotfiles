import { Architecture, Platform } from '@dotfiles/core';
import { FileCache } from '@dotfiles/downloader';
import { createMemFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createMockProjectConfig } from '@dotfiles/testing-helpers';
import { describe, expect, test } from 'bun:test';
import { CargoClient } from '../';

function createMockDownloader(responses: string[]) {
  let callIndex = 0;
  const downloader = {
    download: async () => {
      const safeIndex = Math.min(callIndex, responses.length - 1);
      const value = responses[safeIndex];
      callIndex++;
      return Buffer.from(value ?? '');
    },
    registerStrategy: () => {},
    downloadToFile: async () => {},
    getCallCount: () => callIndex,
  };
  return downloader;
}

describe('CargoClient caching', () => {
  test('should cache crates.io metadata when enabled', async () => {
    const { fs } = await createMemFileSystem();
    const logger = new TestLogger();
    const config = await createMockProjectConfig({
      config: {},
      filePath: '/config.yaml',
      fileSystem: fs,
      logger,
      systemInfo: { platform: Platform.MacOS, arch: Architecture.Arm64, homeDir: '/home/test' },
      env: {},
    });

    const mockDownloader = createMockDownloader([
      JSON.stringify({ crate: { name: 'eza', newest_version: '1.0.0' }, versions: [] }),
    ]);

    const cache = new FileCache(logger, fs, {
      enabled: true,
      defaultTtl: 60_000,
      cacheDir: '/cache/cargo',
      storageStrategy: 'json',
    });

    const client = new CargoClient(logger, config, mockDownloader, cache);

    const first = await client.getCrateMetadata('eza');
    const second = await client.getCrateMetadata('eza');

    expect(first?.crate.newest_version).toBe('1.0.0');
    expect(second?.crate.newest_version).toBe('1.0.0');
    // Only one underlying download should have occurred
    expect(mockDownloader.getCallCount()).toBe(1);
  });

  test('should cache Cargo.toml parsing when githubRaw cache enabled', async () => {
    const { fs } = await createMemFileSystem();
    const logger = new TestLogger();
    const config = await createMockProjectConfig({
      config: {},
      filePath: '/config.yaml',
      fileSystem: fs,
      logger,
      systemInfo: { platform: Platform.MacOS, arch: Architecture.Arm64, homeDir: '/home/test' },
      env: {},
    });

    const cargoToml = '[package]\nname="tool"\nversion="0.1.0"';
    const mockDownloader = createMockDownloader([cargoToml]);

    const cache = new FileCache(logger, fs, {
      enabled: true,
      defaultTtl: 60_000,
      cacheDir: '/cache/cargo',
      storageStrategy: 'json',
    });

    const client = new CargoClient(logger, config, mockDownloader, undefined, cache);

    const first = await client.getCargoTomlPackage('https://raw.githubusercontent.com/owner/repo/main/Cargo.toml');
    const second = await client.getCargoTomlPackage('https://raw.githubusercontent.com/owner/repo/main/Cargo.toml');

    expect(first?.name).toBe('tool');
    expect(second?.name).toBe('tool');
  });
});
