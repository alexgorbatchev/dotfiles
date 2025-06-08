/**
 * @file generator/src/types/archive.types.ts
 * @description Types related to archive extraction.
 *
 * ## Development Plan
 *
 * ### Tasks
 * - [x] Define types for archive extraction.
 * - [ ] Add JSDoc comments to all types and properties.
 * - [ ] Ensure all necessary imports are present.
 * - [ ] Ensure all types are exported.
 * - [ ] (No dedicated tests needed for this file as it only contains type definitions - correctness verified by TSC and consuming code's tests, as per techContext.md and .roorules)
 * - [ ] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

// ============================================
// Archive Extraction Types
// ============================================

/**
 * Supported archive formats
 */
export type ArchiveFormat =
  | 'auto' // Auto-detect based on file extension
  | 'tar' // Plain tar
  | 'tar.gz' // Gzipped tar
  | 'tar.bz2' // Bzip2 tar
  | 'tar.xz' // XZ tar
  | 'tar.lzma' // LZMA tar
  | 'zip' // ZIP archive
  | 'rar' // RAR archive
  | '7z' // 7-Zip archive
  | 'deb' // Debian package
  | 'rpm' // RPM package
  | 'dmg'; // macOS disk image

/**
 * Options for extracting archives
 */
export interface ExtractOptions {
  format?: ArchiveFormat;
  stripComponents?: number;
  targetDir?: string;
  preservePermissions?: boolean;
  detectExecutables?: boolean;
}

/**
 * Result of archive extraction
 */
export interface ExtractResult {
  extractedFiles: string[];
  executables: string[]; // Files that were made executable
  rootDir?: string; // Top-level directory if archive contained one
}

/**
 * Interface for the archive extraction service
 */
export interface IArchiveExtractor {
  extract(archivePath: string, options?: ExtractOptions): Promise<ExtractResult>;
  detectFormat(filePath: string): Promise<ArchiveFormat>;
  isSupported(format: ArchiveFormat): boolean;
}
