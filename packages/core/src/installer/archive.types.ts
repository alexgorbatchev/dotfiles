/**
 * Defines the set of supported archive formats that the system can handle.
 *
 * This type is used to specify the format of an archive for extraction or to
 * indicate a detected format.
 *
 * @public
 */
export type ArchiveFormat =
  /**
   * Instructs the extractor to auto-detect the archive format based on the
   * file's extension or magic bytes.
   */
  | 'auto'
  /** A plain TAR archive (Tape Archive), typically with a `.tar` extension. */
  | 'tar'
  /** A Gzip-compressed TAR archive, commonly `.tar.gz` or `.tgz`. */
  | 'tar.gz'
  /** A Bzip2-compressed TAR archive, commonly `.tar.bz2`. */
  | 'tar.bz2'
  /** An XZ-compressed TAR archive, commonly `.tar.xz`. */
  | 'tar.xz'
  /** An LZMA-compressed TAR archive, commonly `.tar.lzma`. */
  | 'tar.lzma'
  /** A ZIP archive, commonly `.zip`. */
  | 'zip'
  /** A RAR archive, commonly `.rar`. */
  | 'rar'
  /** A 7-Zip archive, commonly `.7z`. */
  | '7z'
  /** A Debian software package, commonly `.deb`. */
  | 'deb'
  /** An RPM Package Manager package, commonly `.rpm`. */
  | 'rpm'
  /** A macOS Disk Image, commonly `.dmg`. */
  | 'dmg';

/**
 * Defines the options available when extracting an archive.
 *
 * These options allow for customization of the extraction process, such as
 * specifying the format, stripping leading directory components, or preserving
 * permissions.
 *
 * @public
 */
export interface IExtractOptions {
  /**
   * The format of the archive. If not provided, the extractor will attempt to
   * auto-detect it.
   * @see {@link ArchiveFormat}
   */
  format?: ArchiveFormat;

  /**
   * The directory where the archive contents should be extracted.
   *
   * If not specified, the behavior depends on the extractor implementation; it
   * may use a temporary directory or extract in place.
   */
  targetDir?: string;

  /**
   * If `true`, attempts to detect and set executable permissions on files
   * after extraction. This is particularly useful for binaries within archives.
   * @default false
   */
  detectExecutables?: boolean;
}

/**
 * Represents the result of an archive extraction operation.
 *
 * It includes a list of all extracted files, any files that were made
 * executable, and the root directory if the archive had a single top-level
 * directory.
 *
 * @public
 */
export interface IExtractResult {
  /** An array of absolute paths to all files that were successfully extracted. */
  extractedFiles: string[];

  /**
   * An array of absolute paths to files that were identified as executables
   * and had their permissions set accordingly.
   */
  executables: string[];
}
