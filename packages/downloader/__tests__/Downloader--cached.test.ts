import type { IFileSystem } from "@dotfiles/file-system";
import { createMemFileSystem } from "@dotfiles/file-system";
import { TestLogger } from "@dotfiles/logger";
import { FetchMockHelper } from "@dotfiles/testing-helpers";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { FileCache } from "../cache/FileCache";
import type { ICacheConfig } from "../cache/types";
import { Downloader } from "../Downloader";

type ProgressEventTuple = [number, number | null];

describe("Downloader with Cache", () => {
  let logger: TestLogger;
  let mockFileSystem: IFileSystem;
  let cache: FileCache;
  let downloader: Downloader;
  let cacheConfig: ICacheConfig;
  let fetchMockHelper: FetchMockHelper;

  beforeEach(async () => {
    logger = new TestLogger();
    const { fs } = await createMemFileSystem();
    mockFileSystem = fs;
    cacheConfig = {
      enabled: true,
      defaultTtl: 60000,
      cacheDir: "/cache/downloads",
      storageStrategy: "binary",
    };
    cache = new FileCache(logger, mockFileSystem, cacheConfig);
    downloader = new Downloader(logger, mockFileSystem, undefined, cache);
    fetchMockHelper = new FetchMockHelper();
    fetchMockHelper.setup();
    fetchMockHelper.reset(); // Reset any previous mock state
  });

  afterEach(() => {
    fetchMockHelper.restore();
  });

  describe("constructor with cache", () => {
    it("should create cached strategy when cache is provided", () => {
      expect(downloader).toBeDefined();

      // Verify constructor log
      logger.expect(["DEBUG"], ["Downloader"], [], ["Created CachedDownloadStrategy wrapping NodeFetchStrategy"]);
    });

    it("should work without cache when none provided", () => {
      const downloaderWithoutCache = new Downloader(logger, mockFileSystem);
      expect(downloaderWithoutCache).toBeDefined();
    });
  });

  describe("download with caching functionality", () => {
    const testUrl = "https://example.com/test-file.zip";
    const testData = "test file content";

    it("should cache downloads and retrieve from cache on second request", async () => {
      // Mock the first fetch request
      fetchMockHelper.mockResponseOnce({
        status: 200,
        body: testData,
        headers: { "Content-Type": "application/zip" },
      });

      // First download - should hit the network
      const result1 = await downloader.download(logger, testUrl);
      expect(result1).toEqual(Buffer.from(testData));

      // Verify fetch was called once
      expect(fetchMockHelper.getSpy()).toHaveBeenCalledTimes(1);

      // Second download - should hit cache, no additional network call
      const result2 = await downloader.download(logger, testUrl);
      expect(result2).toEqual(Buffer.from(testData));

      // Verify fetch was still only called once (cache hit)
      expect(fetchMockHelper.getSpy()).toHaveBeenCalledTimes(1);

      // Verify logger received download started message
      logger.expect(["DEBUG"], ["Downloader", "download"], [], ["Downloading URL"]);
    });

    it("should use cache when progress callback is provided", async () => {
      // Mock one request; second call should hit cache
      fetchMockHelper.mockImplementation({
        status: 200,
        body: testData,
        headers: { "Content-Type": "application/zip" },
      });

      let progressCallCount = 0;
      const onProgress = () => {
        progressCallCount++;
      };

      // First download with progress callback - should hit network
      const result1 = await downloader.download(logger, testUrl, { onProgress });
      expect(result1).toEqual(Buffer.from(testData));

      // Second download with progress callback - should use cache
      const result2 = await downloader.download(logger, testUrl, { onProgress });
      expect(result2).toEqual(Buffer.from(testData));

      // Verify fetch was called once (cache hit)
      expect(fetchMockHelper.getSpy()).toHaveBeenCalledTimes(1);

      // Verify progress callback was called for both downloads
      expect(progressCallCount).toBeGreaterThan(0);
    });

    it("should report immediate 0->100 progress on cache hit", async () => {
      fetchMockHelper.mockResponseOnce({
        status: 200,
        body: testData,
        headers: { "Content-Type": "application/zip" },
      });

      const firstProgress: ProgressEventTuple[] = [];
      await downloader.download(logger, testUrl, {
        onProgress: (bytesDownloaded, totalBytes) => {
          firstProgress.push([bytesDownloaded, totalBytes]);
        },
      });

      const secondProgress: ProgressEventTuple[] = [];
      await downloader.download(logger, testUrl, {
        onProgress: (bytesDownloaded, totalBytes) => {
          secondProgress.push([bytesDownloaded, totalBytes]);
        },
      });

      expect(fetchMockHelper.getSpy()).toHaveBeenCalledTimes(1);
      expect(firstProgress.length).toBeGreaterThan(0);
      expect(secondProgress).toEqual([
        [0, Buffer.byteLength(testData)],
        [Buffer.byteLength(testData), Buffer.byteLength(testData)],
      ]);
    });

    it("should create destination directory on cached file writes with progress callback", async () => {
      fetchMockHelper.mockResponseOnce({
        status: 200,
        body: testData,
        headers: { "Content-Type": "application/zip" },
      });

      await downloader.download(logger, testUrl, {
        onProgress: () => {},
      });

      const cachedFilePath = "/staging/nested/path/test-file.zip";
      const progressEvents: ProgressEventTuple[] = [];

      await downloader.downloadToFile(logger, testUrl, cachedFilePath, {
        onProgress: (bytesDownloaded, totalBytes) => {
          progressEvents.push([bytesDownloaded, totalBytes]);
        },
      });

      expect(fetchMockHelper.getSpy()).toHaveBeenCalledTimes(1);
      expect(await mockFileSystem.exists(cachedFilePath)).toBe(true);
      expect(await mockFileSystem.readFile(cachedFilePath)).toBe(testData);
      expect(progressEvents).toEqual([
        [0, Buffer.byteLength(testData)],
        [Buffer.byteLength(testData), Buffer.byteLength(testData)],
      ]);
    });

    it("should work with disabled cache", async () => {
      const disabledCacheConfig = { ...cacheConfig, enabled: false };
      const disabledCache = new FileCache(logger, mockFileSystem, disabledCacheConfig);
      const downloaderWithDisabledCache = new Downloader(logger, mockFileSystem, undefined, disabledCache);

      // Mock two fetch requests since cache is disabled
      fetchMockHelper.mockImplementation({
        status: 200,
        body: testData,
        headers: { "Content-Type": "application/zip" },
      });

      // First download - should hit network
      const result1 = await downloaderWithDisabledCache.download(logger, testUrl);
      expect(result1).toEqual(Buffer.from(testData));

      // Second download - should hit network again (cache disabled)
      const result2 = await downloaderWithDisabledCache.download(logger, testUrl);
      expect(result2).toEqual(Buffer.from(testData));

      // Verify fetch was called twice (cache disabled)
      expect(fetchMockHelper.getSpy()).toHaveBeenCalledTimes(2);
    });

    it("should handle different URLs separately in cache", async () => {
      const testUrl1 = "https://example.com/file1.zip";
      const testUrl2 = "https://example.com/file2.zip";
      const testData1 = "content for file 1";
      const testData2 = "content for file 2";

      fetchMockHelper.mockResponseOnce({
        status: 200,
        body: testData1,
        headers: { "Content-Type": "application/zip" },
      });
      fetchMockHelper.mockResponseOnce({
        status: 200,
        body: testData2,
        headers: { "Content-Type": "application/zip" },
      });

      // Download both URLs
      const result1 = await downloader.download(logger, testUrl1);
      const result2 = await downloader.download(logger, testUrl2);

      expect(result1).toEqual(Buffer.from(testData1));
      expect(result2).toEqual(Buffer.from(testData2));

      // Both should be cached now - second requests should hit cache
      const cachedResult1 = await downloader.download(logger, testUrl1);
      const cachedResult2 = await downloader.download(logger, testUrl2);

      expect(cachedResult1).toEqual(Buffer.from(testData1));
      expect(cachedResult2).toEqual(Buffer.from(testData2));

      // Only 2 network calls should have been made (initial downloads)
      expect(fetchMockHelper.getSpy()).toHaveBeenCalledTimes(2);
    });

    it("should cache downloads to file without affecting functionality", async () => {
      const filePath = "/downloaded-file.zip";

      fetchMockHelper.mockResponseOnce({
        status: 200,
        body: testData,
        headers: { "Content-Type": "application/zip" },
      });

      // Download to file - should bypass cache but still work
      await downloader.downloadToFile(logger, testUrl, filePath);

      // Verify file was written
      const fileExists = await mockFileSystem.exists(filePath);
      expect(fileExists).toBe(true);

      const fileContent = await mockFileSystem.readFile(filePath);
      expect(fileContent).toBe(testData);

      // Verify network call was made
      expect(fetchMockHelper.getSpy()).toHaveBeenCalledTimes(1);
    });
  });
});
