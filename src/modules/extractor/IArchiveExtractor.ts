/**
 * @file generator/src/modules/extractor/IArchiveExtractor.ts
 * @description Defines the interface for an archive extraction service.
 */

import type { ArchiveFormat, ExtractOptions, ExtractResult } from '../../types';

/**
 * Interface for a service that extracts various archive formats.
 */
export interface IArchiveExtractor {
  /**
   * Extracts an archive file to a specified target directory.
   *
   * @param archivePath The path to the archive file.
   * @param options Optional settings for the extraction process, such as the
   *                archive format (if not auto-detected), number of path
   *                components to strip, target directory, and whether to
   *                preserve permissions or auto-detect/set executables.
   * @returns A promise that resolves with an ExtractResult object containing
   *          information about the extracted files and any detected executables.
   * @throws Will throw an error if extraction fails (e.g., unsupported format, corrupted archive, I/O error).
   */
  extract(archivePath: string, options?: ExtractOptions): Promise<ExtractResult>;

  /**
   * Attempts to detect the format of an archive file.
   * This might use file extensions or magic numbers.
   *
   * @param filePath The path to the file.
   * @returns A promise that resolves with the detected ArchiveFormat.
   * @throws Will throw an error if the format cannot be detected or is unsupported.
   */
  detectFormat(filePath: string): Promise<ArchiveFormat>;

  /**
   * Checks if a given archive format is supported by this extractor implementation.
   *
   * @param format The archive format to check.
   * @returns True if the format is supported, false otherwise.
   */
  isSupported(format: ArchiveFormat): boolean;
}
