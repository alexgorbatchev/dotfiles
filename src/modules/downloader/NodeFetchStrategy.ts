/**
 * @file generator/src/modules/downloader/NodeFetchStrategy.ts
 * @description Download strategy using Node.js's native fetch API.
 */

import type { DownloadStrategy } from './DownloadStrategy';
import type { DownloadOptions, DownloadProgress } from './IDownloader';
import { Writable } from 'node:stream';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

export class NodeFetchStrategy implements DownloadStrategy {
  public readonly name = 'node-fetch';

  public async isAvailable(): Promise<boolean> {
    // Node.js fetch is generally available in modern Node versions.
    // Bun also provides a compatible fetch.
    return typeof fetch === 'function';
  }

  public async download(url: string, options: DownloadOptions): Promise<Buffer | void> {
    const {
      headers,
      timeout,
      onProgress,
      destinationPath,
      retryCount = 0,
      retryDelay = 1000,
    } = options;

    let attempt = 0;
    while (attempt <= retryCount) {
      try {
        const controller = new AbortController();
        let timeoutId: NodeJS.Timeout | undefined;

        if (timeout) {
          timeoutId = setTimeout(() => controller.abort(), timeout);
        }

        const response = await fetch(url, {
          headers,
          signal: controller.signal,
        });

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (!response.ok) {
          throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
        }

        const totalBytes = Number(response.headers.get('content-length')) || undefined;
        let bytesDownloaded = 0;

        if (onProgress && totalBytes) {
          onProgress({ bytesDownloaded, totalBytes, percentage: 0 });
        }

        // Logic to handle streaming with progress
        const chunks: Buffer[] = [];
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Response body is not readable.');
        }

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(Buffer.from(value)); // Convert Uint8Array to Buffer
            bytesDownloaded += value.length;
            if (onProgress) {
              const percentage = totalBytes ? (bytesDownloaded / totalBytes) * 100 : undefined;
              // Speed calculation would require timing, more complex for this basic strategy here
              onProgress({ bytesDownloaded, totalBytes, percentage });
            }
          }
        }

        const resultBuffer = Buffer.concat(chunks);

        if (destinationPath) {
          const fileStream = createWriteStream(destinationPath);
          // Use pipeline to handle backpressure and errors when writing to file
          await pipeline(Readable.from(resultBuffer), fileStream);
          return; // Resolves with void when saving to file
        } else {
          return resultBuffer; // Resolves with Buffer when not saving to file
        }
      } catch (error) {
        if (attempt < retryCount) {
          attempt++;
          if (onProgress) {
            // Optional: notify progress of a retry attempt
            // onProgress({ bytesDownloaded: 0, totalBytes: undefined, percentage: 0, speed: undefined, status: `Retrying (${attempt}/${retryCount})...` });
          }
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        } else {
          throw error; // Max retries reached, rethrow the last error
        }
      }
    }
    // Should not be reached if retryCount >= 0, but as a fallback:
    throw new Error(`Download failed for ${url} after ${retryCount} retries.`);
  }
}

// Minimal Readable stream from Buffer for pipeline
import { Readable } from 'node:stream';
