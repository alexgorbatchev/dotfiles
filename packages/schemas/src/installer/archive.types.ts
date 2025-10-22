/**
 * Defines the set of supported archive formats that the system can handle.
 * This type is used to specify the format of an archive for extraction
 * or to indicate a detected format.
 */
export type ArchiveFormat =
  /** Auto-detect the archive format based on the file extension. */
  | 'auto'
  /** Plain TAR archive (Tape Archive). */
  | 'tar'
  /** Gzip compressed TAR archive. Commonly `.tar.gz` or `.tgz`. */
  | 'tar.gz'
  /** Bzip2 compressed TAR archive. Commonly `.tar.bz2`. */
  | 'tar.bz2'
  /** XZ compressed TAR archive. Commonly `.tar.xz`. */
  | 'tar.xz'
  /** LZMA compressed TAR archive. Commonly `.tar.lzma`. */
  | 'tar.lzma'
  /** ZIP archive. Commonly `.zip`. */
  | 'zip'
  /** RAR archive. Commonly `.rar`. */
  | 'rar'
  /** 7-Zip archive. Commonly `.7z`. */
  | '7z'
  /** Debian software package. Commonly `.deb`. */
  | 'deb'
  /** RPM Package Manager package. Commonly `.rpm`. */
  | 'rpm'
  /** macOS Disk Image. Commonly `.dmg`. */
  | 'dmg';

/**
 * Defines the options available when extracting an archive.
 * These options allow customization of the extraction process, such as specifying
 * the format, stripping leading directory components, or preserving permissions.
 */
export interface ExtractOptions {
  /**
   * The format of the archive. If not provided, the extractor will attempt to auto-detect it.
   * @see ArchiveFormat
   */
  format?: ArchiveFormat;
  /**
   * The directory where the archive contents should be extracted.
   * If not specified, a temporary directory might be used or extraction might occur in place,
   * depending on the extractor implementation.
   */
  targetDir?: string;
  /**
   * Whether to preserve the original file permissions from the archive.
   * @default false
   */
  preservePermissions?: boolean;
  /**
   * Whether to attempt to detect and make executable files executable after extraction.
   * This is particularly useful for binaries within archives.
   * @default false
   */
  detectExecutables?: boolean;
}

/**
 * Represents the result of an archive extraction operation.
 * It includes a list of all extracted files, any files that were made executable,
 * and the root directory if the archive had a single top-level directory.
 */
export interface ExtractResult {
  /** An array of paths to all files that were successfully extracted. */
  extractedFiles: string[];
  /** An array of paths to files that were identified as executables and had their permissions set accordingly. */
  executables: string[];
  /**
   * The path to the top-level directory if the archive contained a single root directory.
   * This is useful for archives that wrap all their content in one folder (e.g., `mytool-1.0/bin/mytool`).
   * If the archive does not have a single root directory, this will be undefined.
   */
  rootDir?: string;
}

/**
 * Defines the contract for an archive extraction service.
 * Implementations of this interface are responsible for handling the extraction
 * of various archive formats.
 */
export interface IArchiveExtractor {
  /**
   * Extracts the contents of the specified archive file.
   * @param archivePath The path to the archive file to be extracted.
   * @param options Optional configuration for the extraction process.
   * @returns A promise that resolves with the result of the extraction.
   * @see ExtractOptions
   * @see ExtractResult
   */
  extract(archivePath: string, options?: ExtractOptions): Promise<ExtractResult>;

  /**
   * Detects the format of an archive file based on its content or extension.
   * @param filePath The path to the file whose archive format needs to be detected.
   * @returns A promise that resolves with the detected {@link ArchiveFormat}.
   *          Returns 'auto' or throws an error if detection fails.
   */
  detectFormat(filePath: string): Promise<ArchiveFormat>;

  /**
   * Checks if a given archive format is supported by this extractor.
   * @param format The {@link ArchiveFormat} to check.
   * @returns `true` if the format is supported, `false` otherwise.
   */
  isSupported(format: ArchiveFormat): boolean;
}
