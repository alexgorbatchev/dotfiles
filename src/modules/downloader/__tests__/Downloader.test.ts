/**
 * @file generator/src/modules/downloader/__tests__/Downloader.test.ts
 * @description Tests for the Downloader class.
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { Downloader } from '../Downloader';
import type { DownloadOptions } from '../IDownloader';
import type { DownloadStrategy } from '../DownloadStrategy';
import { NodeFetchStrategy } from '../NodeFetchStrategy';
import type { IFileSystem } from '../../file-system/IFileSystem';
import { MemFileSystem } from '../../file-system/MemFileSystem';

// Mock DownloadStrategy
// Define types for our mock strategies to be reassigned in beforeEach
let mockStrategy1: DownloadStrategy;
let mockStrategy2: DownloadStrategy;
let unavailableStrategy: DownloadStrategy;
let failingStrategy: DownloadStrategy;
let fileSystem: IFileSystem;

describe('Downloader', () => {
  beforeEach(() => {
    fileSystem = new MemFileSystem();
    // Re-initialize mocks before each test to reset their state (e.g., call counts)
    mockStrategy1 = {
      name: 'mockStrategy1',
      isAvailable: mock(async () => true),
      download: mock(async (url: string, options: DownloadOptions) => {
        if (options.destinationPath) return;
        return Buffer.from(`content from ${url} via mockStrategy1`);
      }),
    };

    mockStrategy2 = {
      name: 'mockStrategy2',
      isAvailable: mock(async () => true),
      download: mock(async (url: string, options: DownloadOptions) => {
        if (options.destinationPath) return;
        return Buffer.from(`content from ${url} via mockStrategy2`);
      }),
    };

    unavailableStrategy = {
      name: 'unavailableStrategy',
      isAvailable: mock(async () => false),
      download: mock(async () => Buffer.from('should not be called')),
    };

    failingStrategy = {
      name: 'failingStrategy',
      isAvailable: mock(async () => true),
      download: mock(async () => {
        throw new Error('failingStrategy failed');
      }),
    };
  });

  it('should use the first available strategy', async () => {
    const downloader = new Downloader(fileSystem, [mockStrategy1, mockStrategy2]);
    const url = 'http://example.com/file.txt';
    const result = (await downloader.download(url)) as Buffer;

    expect(mockStrategy1.isAvailable).toHaveBeenCalled();
    expect(mockStrategy1.download).toHaveBeenCalledWith(url, {});
    expect(mockStrategy2.isAvailable).not.toHaveBeenCalled();
    expect(result.toString()).toBe(`content from ${url} via mockStrategy1`);
  });

  it('should use NodeFetchStrategy by default if no strategies are provided', async () => {
    // We need to mock NodeFetchStrategy's methods for this test
    const originalNodeFetchDownload = NodeFetchStrategy.prototype.download;
    NodeFetchStrategy.prototype.download = mock(async (url: string, options: DownloadOptions) => {
      if (options.destinationPath) return;
      return Buffer.from(`content from ${url} via NodeFetchStrategy`);
    });

    const downloader = new Downloader(fileSystem); // No strategies provided
    const url = 'http://example.com/file.txt';
    const result = (await downloader.download(url)) as Buffer;

    expect(result.toString()).toBe(`content from ${url} via NodeFetchStrategy`);

    // Restore original method
    NodeFetchStrategy.prototype.download = originalNodeFetchDownload;
  });

  it('should skip unavailable strategies and use the next available one', async () => {
    const downloader = new Downloader(fileSystem, [unavailableStrategy, mockStrategy1]);
    const url = 'http://example.com/file.txt';
    const result = (await downloader.download(url)) as Buffer;

    expect(unavailableStrategy.isAvailable).toHaveBeenCalled();
    expect(unavailableStrategy.download).not.toHaveBeenCalled();
    expect(mockStrategy1.isAvailable).toHaveBeenCalled();
    expect(mockStrategy1.download).toHaveBeenCalledWith(url, {});
    expect(result.toString()).toBe(`content from ${url} via mockStrategy1`);
  });

  it('should try next strategy if one fails', async () => {
    const downloader = new Downloader(fileSystem, [failingStrategy, mockStrategy1]);
    const url = 'http://example.com/file.txt';
    const result = (await downloader.download(url)) as Buffer;

    expect(failingStrategy.isAvailable).toHaveBeenCalled();
    expect(failingStrategy.download).toHaveBeenCalled();
    expect(mockStrategy1.isAvailable).toHaveBeenCalled();
    expect(mockStrategy1.download).toHaveBeenCalledWith(url, {});
    expect(result.toString()).toBe(`content from ${url} via mockStrategy1`);
  });

  it('should throw an error if all registered strategies are unavailable', async () => {
    const downloader = new Downloader(fileSystem, [unavailableStrategy]);
    const url = 'http://example.com/file.txt';

    await expect(downloader.download(url)).rejects.toThrow(
      'No available download strategy succeeded for http://example.com/file.txt.'
    );
  });

  it('should throw an error if all available strategies fail', async () => {
    const downloader = new Downloader(fileSystem, [failingStrategy, failingStrategy]); // Two instances of failing strategy
    const url = 'http://example.com/file.txt';

    await expect(downloader.download(url)).rejects.toThrow('failingStrategy failed');
    expect(failingStrategy.download).toHaveBeenCalledTimes(2); // Called for both instances
  });

  it('should throw an error if no strategies are registered and download is called', async () => {
    const downloader = new Downloader(fileSystem, []); // Initialize with empty array
    const url = 'http://example.com/file.txt';
    await expect(downloader.download(url)).rejects.toThrow('No download strategies registered.');
  });

  it('can register a new strategy which is then used first', async () => {
    const downloader = new Downloader(fileSystem, [mockStrategy1]); // Initial strategy
    downloader.registerStrategy(mockStrategy2); // Register new one, should be prioritized

    const url = 'http://example.com/file.txt';
    const result = (await downloader.download(url)) as Buffer;

    expect(mockStrategy2.isAvailable).toHaveBeenCalled();
    expect(mockStrategy2.download).toHaveBeenCalledWith(url, {});
    expect(mockStrategy1.isAvailable).not.toHaveBeenCalled(); // Because mockStrategy2 was used
    expect(result.toString()).toBe(`content from ${url} via mockStrategy2`);
  });

  it('should handle destinationPath correctly by returning void', async () => {
    const downloader = new Downloader(fileSystem, [mockStrategy1]);
    const url = 'http://example.com/file.txt';
    const destinationPath = '/tmp/testfile.txt';
    const result = await downloader.download(url, { destinationPath });

    expect(mockStrategy1.download).toHaveBeenCalledWith(url, { destinationPath });
    expect(result).toBeUndefined();
  });
});
