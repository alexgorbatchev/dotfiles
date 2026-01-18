import { type ArchiveFormat, type IExtractOptions, type IExtractResult, type Shell } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { getAllFilesRecursively } from '@dotfiles/utils';
import { randomUUID } from 'node:crypto';
import { basename, extname, join } from 'node:path';
import type { IArchiveExtractor } from './IArchiveExtractor';
import { messages } from './log-messages';

/**
 * Implements archive extraction using system commands.
 *
 * This class provides functionality to extract various archive formats (tar.gz, tar.bz2,
 * tar.xz, tar, zip) using system commands like `tar` and `unzip`. It can auto-detect
 * archive formats by file extension or MIME type, detect and set executable permissions
 * on extracted files, and handle various extraction options.
 *
 * This implementation has a hard dependency on system commands (tar, unzip, file) being
 * available on the system's PATH.
 */
export class ArchiveExtractor implements IArchiveExtractor {
  private readonly fs: IFileSystem;
  private readonly logger: TsLogger;
  private readonly shell: Shell;

  /**
   * Creates a new ArchiveExtractor instance.
   *
   * @param parentLogger - The parent logger for creating sub-loggers.
   * @param fileSystem - The file system interface for file operations.
   * @param shell - The shell executor for running system commands.
   */
  constructor(parentLogger: TsLogger, fileSystem: IFileSystem, shell: Shell) {
    this.fs = fileSystem;
    this.logger = parentLogger.getSubLogger({ name: 'ArchiveExtractor' });
    this.shell = shell;
  }

  /**
   * Detects archive format by examining the file extension.
   *
   * @param fileName - The name of the file to check.
   * @returns The detected ArchiveFormat, or null if the format cannot be determined from the extension.
   */
  private detectFormatByExtension(fileName: string): ArchiveFormat | null {
    const lowerFileName = fileName.toLowerCase();

    if (lowerFileName.endsWith('.tar.gz') || lowerFileName.endsWith('.tgz')) return 'tar.gz';
    if (lowerFileName.endsWith('.tar.bz2') || lowerFileName.endsWith('.tbz2') || lowerFileName.endsWith('.tbz'))
      return 'tar.bz2';
    if (lowerFileName.endsWith('.tar.xz') || lowerFileName.endsWith('.txz')) return 'tar.xz';
    if (lowerFileName.endsWith('.tar.lzma')) return 'tar.lzma';
    if (lowerFileName.endsWith('.tar')) return 'tar';
    if (lowerFileName.endsWith('.zip')) return 'zip';
    if (lowerFileName.endsWith('.rar')) return 'rar';
    if (lowerFileName.endsWith('.7z')) return '7z';
    if (lowerFileName.endsWith('.deb')) return 'deb';
    if (lowerFileName.endsWith('.rpm')) return 'rpm';
    if (lowerFileName.endsWith('.dmg')) return 'dmg';

    return null;
  }

  /**
   * Detects archive format by parsing MIME type output from the `file` command.
   *
   * @param mimeOutput - The output from the `file --mime-type` command.
   * @returns The detected ArchiveFormat, or null if the format cannot be determined from MIME type.
   */
  private detectFormatByMimeType(mimeOutput: string): ArchiveFormat | null {
    if (mimeOutput.includes('gzip')) return 'tar.gz';
    if (mimeOutput.includes('zip')) return 'zip';
    if (mimeOutput.includes('x-bzip2')) return 'tar.bz2';
    if (mimeOutput.includes('x-xz')) return 'tar.xz';
    if (mimeOutput.includes('x-tar')) return 'tar';
    if (mimeOutput.includes('x-7z-compressed')) return '7z';
    if (mimeOutput.includes('x-rar-compressed')) return 'rar';
    if (mimeOutput.includes('x-debian-package')) return 'deb';
    if (mimeOutput.includes('x-rpm')) return 'rpm';
    if (mimeOutput.includes('x-apple-diskimage')) return 'dmg';

    return null;
  }

  private async detectFormatUsingFileCommand(filePath: string, logger: TsLogger): Promise<ArchiveFormat | null> {
    try {
      const commandName = 'file';
      logger.debug(messages.shellCommandStarted(commandName));
      const result = await this.shell`file -b --mime-type ${filePath}`.quiet();
      const output = result.stdout.trim();

      return this.detectFormatByMimeType(output);
    } catch (error) {
      logger.debug(messages.fileCommandFallbackFailed(filePath), error);
      return null;
    }
  }

  /**
   * @inheritdoc IArchiveExtractor.detectFormat
   */
  public async detectFormat(filePath: string): Promise<ArchiveFormat> {
    const logger = this.logger.getSubLogger({ name: 'detectFormat' });
    const fileName = basename(filePath);

    // Try detection by file extension first
    const formatByExtension = this.detectFormatByExtension(fileName);
    if (formatByExtension) {
      return formatByExtension;
    }

    // Fallback to 'file' command
    const formatByMimeType = await this.detectFormatUsingFileCommand(filePath, logger);
    if (formatByMimeType) {
      return formatByMimeType;
    }

    throw new Error(`Unsupported or undetectable archive format for: ${filePath}`);
  }

  /**
   * @inheritdoc IArchiveExtractor.isSupported
   */
  public isSupported(format: ArchiveFormat): boolean {
    const supportedFormats: ArchiveFormat[] = [
      'tar.gz',
      'tar.bz2',
      'tar.xz',
      'tar',
      'zip',
      // 'rar', '7z', 'deb', 'rpm', 'dmg' // Add as implemented
    ];
    return supportedFormats.includes(format);
  }

  private getTarFlagForFormat(format: ArchiveFormat): string {
    switch (format) {
      case 'tar.gz':
        return '-xzf';
      case 'tar.bz2':
        return '-xjf';
      case 'tar.xz':
        return '-xJf';
      case 'tar':
        return '-xf';
      default:
        throw new Error(`Unsupported tar format: ${format}`);
    }
  }

  /**
   * Extracts an archive using the appropriate system command for the format.
   *
   * @param format - The archive format to extract.
   * @param archivePath - Path to the archive file.
   * @param tempExtractDir - Directory where files will be extracted.
   * @returns A promise that resolves when extraction is complete.
   * @throws {Error} If the format is not implemented or the command fails.
   */
  private async extractArchiveByFormat(
    format: ArchiveFormat,
    archivePath: string,
    tempExtractDir: string,
  ): Promise<void> {
    switch (format) {
      case 'tar.gz':
      case 'tar.bz2':
      case 'tar.xz':
      case 'tar': {
        const tarFlag = this.getTarFlagForFormat(format);
        const commandName = 'tar';
        this.logger.debug(messages.shellCommandStarted(commandName));
        await this.shell`tar ${tarFlag} ${archivePath} -C ${tempExtractDir}`.quiet();
        break;
      }
      case 'zip': {
        const commandName = 'unzip';
        this.logger.debug(messages.shellCommandStarted(commandName));
        await this.shell`unzip -qo ${archivePath} -d ${tempExtractDir}`.quiet();
        break;
      }
      default:
        throw new Error(`Extraction for format ${format} not implemented.`);
    }
  }

  /**
   * @inheritdoc IArchiveExtractor.extract
   */
  public async extract(
    parentLogger: TsLogger,
    archivePath: string,
    options: IExtractOptions = {},
  ): Promise<IExtractResult> {
    const logger = parentLogger.getSubLogger({ name: 'extract' });
    const {
      format: explicitFormat,
      targetDir = '.', // Default to current directory if not specified
      detectExecutables = true,
    } = options;

    logger.debug(messages.extractionRequested(archivePath), options);

    const format = explicitFormat || (await this.detectFormat(archivePath));

    if (!this.isSupported(format)) {
      throw new Error(`Unsupported archive format: ${format}`);
    }

    // Ensure target directory exists
    await this.fs.ensureDir(targetDir);

    // Create a temporary subdirectory for extraction to avoid including the archive file itself
    const extractId = randomUUID();
    const tempExtractDir = join(targetDir, `.extract-temp-${extractId}`);
    await this.fs.ensureDir(tempExtractDir);

    try {
      // Extract to temporary directory
      await this.extractArchiveByFormat(format, archivePath, tempExtractDir);

      // Get all files from the temp directory
      const extractedFiles = await getAllFilesRecursively(this.fs, tempExtractDir);

      // Move files from temp directory to target directory
      for (const filePath of extractedFiles) {
        const relativePath = filePath.substring(tempExtractDir.length + 1);
        const targetPath = join(targetDir, relativePath);
        const targetDirPath = join(targetPath, '..');

        await this.fs.ensureDir(targetDirPath);
        await this.fs.rename(filePath, targetPath);
      }

      // Remove the temporary directory
      await this.fs.rm(tempExtractDir, { recursive: true, force: true });

      // Update file paths to reflect final location
      const finalFiles = extractedFiles.map((filePath) => {
        const relativePath = filePath.substring(tempExtractDir.length + 1);
        return join(targetDir, relativePath);
      });

      const result: IExtractResult = {
        extractedFiles: finalFiles,
        executables: [],
      };

      if (detectExecutables) {
        result.executables = await this.detectAndSetExecutables(finalFiles);
      }

      return result;
    } catch (error) {
      // Clean up temp directory on error
      try {
        await this.fs.rm(tempExtractDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Detects files that should be executable and sets the executable permission bit.
   *
   * This method uses heuristics to identify executables: files without extensions or with
   * common script extensions (.sh, .py, .pl, .rb). It checks if the file already has the
   * owner execute bit set, and if not, adds it.
   *
   * @param baseDir - The base directory containing the extracted files (unused, kept for compatibility).
   * @param files - Array of absolute file paths to check.
   * @returns Array of absolute file paths that were identified as executables.
   */
  private async detectAndSetExecutables(files: string[]): Promise<string[]> {
    const logger = this.logger.getSubLogger({ name: 'detectAndSetExecutables' });
    const executables: string[] = [];
    // This is a simplified check. `file` command is more robust.
    // For `zx`, we'd need to ensure `file` command is available or use Node.js based checks.
    // For now, let's assume a simple extension check or common binary names.
    // A more robust solution would use `await $`file -b ${filePath}`;` and parse output.
    for (const filePath of files) {
      try {
        const stat = await this.fs.stat(filePath);
        if (stat.isFile()) {
          // Heuristic: files without extensions or common script extensions
          // This is very basic and platform-dependent.
          const ext = extname(filePath);
          if (ext === '' || ['.sh', '.py', '.pl', '.rb'].includes(ext)) {
            // Check if it's already executable (owner execute bit)
            if (!(stat.mode & 0o100)) {
              logger.debug(messages.executableFlagApplied(filePath));
              await this.fs.chmod(filePath, stat.mode | 0o100); // Add owner execute
            }
            executables.push(filePath);
          }
        }
      } catch (error) {
        logger.debug(messages.executableCheckFailed(filePath), error);
      }
    }
    return executables;
  }
}
