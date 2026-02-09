import type { ArchiveFormat } from '@dotfiles/core';

/**
 * Array of supported archive formats that can be extracted.
 *
 * This list should stay in sync with the ArchiveExtractor.isSupported method.
 */
export const SUPPORTED_ARCHIVE_FORMATS: ArchiveFormat[] = [
  'tar.gz',
  'tar.bz2',
  'tar.xz',
  'tar',
  'zip',
  'gzip',
];

/**
 * Maps file extensions to their corresponding archive formats.
 * Extensions are checked in order - longer/more specific patterns first.
 *
 * Returns the ArchiveFormat if the extension is recognized, or null otherwise.
 */
function detectFormatByExtension(fileName: string): ArchiveFormat | null {
  const lowerFileName = fileName.toLowerCase();

  // Check multi-part extensions first (most specific)
  if (lowerFileName.endsWith('.tar.gz') || lowerFileName.endsWith('.tgz')) return 'tar.gz';
  if (lowerFileName.endsWith('.tar.bz2') || lowerFileName.endsWith('.tbz2') || lowerFileName.endsWith('.tbz'))
    return 'tar.bz2';
  if (lowerFileName.endsWith('.tar.xz') || lowerFileName.endsWith('.txz')) return 'tar.xz';
  if (lowerFileName.endsWith('.tar.lzma')) return 'tar.lzma';
  if (lowerFileName.endsWith('.tar')) return 'tar';

  // Check single-part extensions
  if (lowerFileName.endsWith('.gz')) return 'gzip';
  if (lowerFileName.endsWith('.zip')) return 'zip';
  if (lowerFileName.endsWith('.rar')) return 'rar';
  if (lowerFileName.endsWith('.7z')) return '7z';
  if (lowerFileName.endsWith('.deb')) return 'deb';
  if (lowerFileName.endsWith('.rpm')) return 'rpm';
  if (lowerFileName.endsWith('.dmg')) return 'dmg';

  return null;
}

/**
 * Checks if a file has an archive extension that is supported for extraction.
 *
 * This function checks both that the file has a recognized archive extension AND
 * that the format is actually supported by the extractor (not all detected formats
 * have extraction implemented).
 *
 * @param filename - The filename to check (can include path).
 * @returns True if the file has a supported archive extension, false otherwise.
 *
 * @example
 * isSupportedArchiveFile('tool.tar.gz') // true
 * isSupportedArchiveFile('tool.tbz') // true
 * isSupportedArchiveFile('tool.zip') // true
 * isSupportedArchiveFile('tool.rar') // false (not implemented)
 * isSupportedArchiveFile('tool.exe') // false (not an archive)
 */
export function isSupportedArchiveFile(filename: string): boolean {
  const format = detectFormatByExtension(filename);
  if (!format) return false;
  return SUPPORTED_ARCHIVE_FORMATS.includes(format);
}
