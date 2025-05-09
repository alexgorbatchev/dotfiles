import type fsType from 'node:fs'; // Import the type of the main 'fs' module
import { type Writable, pipeline, Readable } from 'node:stream'; // Import Readable
import { promisify } from 'node:util';
import path from 'node:path'; // Import path
import { createLogger } from './logger';

const logger = createLogger('download');
const streamPipeline = promisify(pipeline); // Used for piping streams

/**
 * Downloads a file from a URL to a specified destination path using streams.
 *
 * @param url The URL to download from.
 * @param destinationPath The full path where the file should be saved.
 * @param fs The file system implementation (e.g., node:fs or memfs instance).
 */
export async function downloadFile(
  url: string,
  destinationPath: string,
  fs: typeof fsType, // Expect the full fs module type
  customFetch: typeof fetch = fetch // Allow fetch to be injected
): Promise<void> {
  logger('Downloading %s to %s', url, destinationPath);

  let response: Response;
  try {
    // Use injected fetch or global fetch
    response = await customFetch(url, {
      method: 'GET',
      redirect: 'follow', // Follow redirects
    });
  } catch (error) {
    logger('Fetch failed for %s: %o', url, error);
    throw new Error(
      `Failed to initiate download from ${url}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!response.ok) {
    logger('Download failed: Status %d for %s', response.status, url);
    throw new Error(
      `Failed to download file from ${url}. Status: ${response.status} ${response.statusText}`
    );
  }

  if (!response.body) {
    throw new Error(`Response body is null for ${url}. Cannot download.`);
  }

  // Ensure destination directory exists using the promises API of the injected fs
  const dir = path.dirname(destinationPath);
  await fs.promises.mkdir(dir, { recursive: true });

  // Create a writable stream using the injected fs object's createWriteStream method
  logger('Creating write stream for %s', destinationPath);
  const fileStream = fs.createWriteStream(destinationPath);

  try {
    // Use stream pipeline to handle backpressure and errors
    // Convert the web stream (response.body) to a Node.js Readable stream
    if (!Readable.fromWeb) {
      // Check might be redundant if Node version is guaranteed >= 18
      throw new Error(
        'Readable.fromWeb is not available in this Node.js version. Cannot process web stream.'
      );
    }
    // Cast response.body to 'any' to resolve potential type mismatch between fetch API and Node stream types
    const bodyNodeStream = Readable.fromWeb(response.body as any);

    await streamPipeline(bodyNodeStream, fileStream); // Pipe directly
    logger('File downloaded successfully: %s', destinationPath);
  } catch (error) {
    logger('Pipeline failed for %s: %o', destinationPath, error);
    // Attempt to clean up partially downloaded file using promises API
    try {
      await fs.promises.unlink(destinationPath);
    } catch (unlinkError: any) {
      // Catch specific error types if needed
      // Ignore ENOENT (file already gone), log others
      if (unlinkError?.code !== 'ENOENT') {
        logger('Failed to clean up partial file %s: %o', destinationPath, unlinkError);
      }
    }
    throw new Error(
      `Failed to write downloaded file to ${destinationPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
