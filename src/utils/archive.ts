import type fsType from 'node:fs';
import path from 'node:path';
import { $ } from 'zx';
import { createLogger } from './logger';

const logger = createLogger('archive');

/**
 * Extracts an archive file to a specified destination directory using system tools via zx.
 * Supports .zip, .tar.gz, .tgz, and .gz formats (based on file extension).
 *
 * @param archivePath The path to the archive file.
 * @param destinationDir The directory where the contents should be extracted.
 * @param fs The file system implementation (e.g., node:fs or memfs instance) for mkdir.
 */
export async function extractArchive(
  archivePath: string,
  destinationDir: string,
  fs: typeof fsType // fs is used for mkdir
): Promise<void> {
  logger('Extracting %s to %s using system tools via zx', archivePath, destinationDir);

  // Ensure destination directory exists
  await fs.promises.mkdir(destinationDir, { recursive: true });

  // Use zx's built-in cd to change directory for extraction if needed,
  // or ensure commands correctly target destinationDir.
  // For tar and unzip, -C and -d flags handle this. For gunzip, redirection is used.

  // Make zx commands quieter by default unless verbose logging is on
  $.quiet = !logger.enabled; // if logger is enabled, zx will not be quiet

  const lowerArchivePath = archivePath.toLowerCase();

  try {
    if (lowerArchivePath.endsWith('.zip')) {
      logger('Detected .zip format. Using system "unzip".');
      await $`unzip -o ${archivePath} -d ${destinationDir}`;
      logger('.zip extraction complete.');
    } else if (lowerArchivePath.endsWith('.tar.gz') || lowerArchivePath.endsWith('.tgz')) {
      logger('Detected .tar.gz/.tgz format. Using system "tar".');
      await $`tar -xzf ${archivePath} -C ${destinationDir}`;
      logger('.tar.gz/.tgz extraction complete.');
    } else if (lowerArchivePath.endsWith('.gz')) {
      logger('Detected single .gz file format. Using system "gunzip".');
      const destinationFilePath = path.join(destinationDir, path.basename(archivePath, '.gz'));
      // Ensure the output of gunzip is a string that can be used in the command template
      await $`gunzip -c ${archivePath} > ${destinationFilePath}`;
      logger('Single .gz file decompression complete: %s', destinationFilePath);
    } else {
      throw new Error(`Unsupported archive format: ${archivePath}`);
    }
  } catch (error: any) {
    // Catching 'any' as zx.ProcessOutput has a specific structure
    logger('Extraction failed for %s: %o', archivePath, error);
    // zx errors (ProcessOutputObject) contain stdout, stderr, exitCode
    const errorMessage =
      error.stderr || error.stdout || (error instanceof Error ? error.message : String(error));
    throw new Error(
      `Failed to extract archive ${archivePath} using system tools. Exit code: ${error.exitCode}. Error: ${errorMessage}`
    );
  }
}
