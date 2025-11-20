import crypto from 'node:crypto';
import type { IDownloadOptions } from '../IDownloader';

/**
 * Creates a cache key for a download operation.
 * The key is based on the URL and relevant options that affect the download result.
 * @param url The URL to download from
 * @param options The download options
 * @returns A unique cache key for this download
 */
export function createCacheKey(url: string, options: IDownloadOptions = {}): string {
  // Only include options that affect the actual download content
  const relevantOptions = {
    headers: options.headers || {},
    // Don't include progress callbacks, retry settings, or timeouts as they don't affect content
  };

  const keyData = {
    url,
    options: relevantOptions,
  };

  // Create a hash of the key data to ensure consistent, filesystem-safe keys
  const hash = crypto.createHash('sha256').update(JSON.stringify(keyData)).digest('hex');
  return `download:${hash}`;
}

/**
 * Creates a cache key for API responses.
 * @param url The API endpoint URL
 * @param headers Optional headers that might affect the response
 * @returns A unique cache key for this API call
 */
export function createApiCacheKey(url: string, headers?: Record<string, string>): string {
  const keyData = {
    url,
    headers: headers || {},
  };

  const hash = crypto.createHash('sha256').update(JSON.stringify(keyData)).digest('hex');
  return `api:${hash}`;
}

/**
 * Checks if a cache key is for a download operation.
 * @param key The cache key to check
 * @returns True if the key is for a download operation
 */
export function isDownloadKey(key: string): boolean {
  return key.startsWith('download:');
}

/**
 * Checks if a cache key is for an API operation.
 * @param key The cache key to check
 * @returns True if the key is for an API operation
 */
export function isApiKey(key: string): boolean {
  return key.startsWith('api:');
}
