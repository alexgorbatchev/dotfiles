import type { IDownloadOptions } from '../../../IDownloader';
import type { IDownloadStrategy } from '../../../IDownloadStrategy';
import type { ICache } from '../../types';

export class MockDownloadStrategy implements IDownloadStrategy {
  public readonly name = 'mock-strategy';
  public downloadCalls: Array<{ url: string; options: IDownloadOptions; }> = [];
  public downloadResult: Buffer = Buffer.from('mock-download-result');
  public shouldFail = false;
  public isAvailableResult = true;

  async isAvailable(): Promise<boolean> {
    return this.isAvailableResult;
  }

  async download(url: string, options: IDownloadOptions): Promise<Buffer | undefined> {
    this.downloadCalls.push({ url, options });
    if (this.shouldFail) {
      throw new Error('Mock download failed');
    }
    // Return void if destinationPath is provided, otherwise return buffer
    if (options.destinationPath) {
      return;
    }
    return this.downloadResult;
  }

  reset(): void {
    this.downloadCalls = [];
    this.downloadResult = Buffer.from('mock-download-result');
    this.shouldFail = false;
    this.isAvailableResult = true;
  }
}

export class MockCache implements ICache {
  public storage = new Map<string, unknown>();
  public getCalls: string[] = [];
  public setCalls: Array<{ key: string; data: unknown; ttl?: number; }> = [];
  public setDownloadCalls: Array<{
    key: string;
    data: Buffer;
    ttl?: number;
    url: string;
    contentType?: string;
  }> = [];
  public shouldFailGet = false;
  public shouldFailSet = false;

  async get<T>(key: string): Promise<T | null> {
    this.getCalls.push(key);
    if (this.shouldFailGet) {
      throw new Error('Cache get failed');
    }
    return (this.storage.get(key) as T) || null;
  }

  async set<T>(key: string, data: T, ttlMs?: number): Promise<void> {
    this.setCalls.push({ key, data, ttl: ttlMs });
    if (this.shouldFailSet) {
      throw new Error('Cache set failed');
    }
    this.storage.set(key, data);
  }

  async setDownload(
    key: string,
    data: Buffer,
    ttlMs: number | undefined,
    url: string,
    contentType?: string,
  ): Promise<void> {
    this.setDownloadCalls.push({ key, data, ttl: ttlMs, url, contentType });
    if (this.shouldFailSet) {
      throw new Error('Cache setDownload failed');
    }
    this.storage.set(key, data);
  }

  async has(key: string): Promise<boolean> {
    return this.storage.has(key);
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async clearExpired(): Promise<void> {
    // Mock implementation
  }

  async clear(): Promise<void> {
    this.storage.clear();
  }

  reset(): void {
    this.storage.clear();
    this.getCalls = [];
    this.setCalls = [];
    this.setDownloadCalls = [];
    this.shouldFailGet = false;
    this.shouldFailSet = false;
  }
}
