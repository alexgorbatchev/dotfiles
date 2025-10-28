import { exec as execCallback } from 'node:child_process';
import { basename, extname, join } from 'node:path';
import { promisify } from 'node:util';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import type { ArchiveFormat, ExtractOptions, ExtractResult } from '@dotfiles/schemas';
import type { IArchiveExtractor } from './IArchiveExtractor';
import { messages } from './log-messages';

interface ExecError extends Error {
  code?: number;
  stdout?: string;
  stderr?: string;
}

interface AugmentedExecError extends Error {
  stdout: string;
  stderr: string;
  exitCode: number;
  originalError: ExecError;
}

/**
 * Implements the IArchiveExtractor interface using system commands.
 *
 * @remarks
 * This module has a hard dependency on system commands like `tar`, `unzip`,
 * and `file` being available on the system's PATH.
 */
export class ArchiveExtractor implements IArchiveExtractor {
  private readonly fs: IFileSystem;
  private readonly logger: TsLogger;

  constructor(parentLogger: TsLogger, fileSystem: IFileSystem) {
    this.fs = fileSystem;
    this.logger = parentLogger.getSubLogger({ name: 'ArchiveExtractor' });
  }

  // Promisify exec for use with async/await
  private promisedExec = promisify(execCallback);

  /**
   * Executes a shell command using child_process.exec.
   * @param command The command string to execute.
   * @returns A promise that resolves with an object containing stdout, stderr, and exitCode.
   * @throws An error object augmented with stdout, stderr, and exitCode if the command fails.
   */
  private async executeShellCommand(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const logger = this.logger.getSubLogger({ name: 'executeShellCommand' });
    try {
      logger.debug(messages.shellCommandStarted(command));
      const { stdout, stderr } = await this.promisedExec(command);
      return { stdout, stderr, exitCode: 0 };
    } catch (error: unknown) {
      const execError = error as ExecError;
      // Augment the error object with stdio and exit code
      const augmentedError: AugmentedExecError = new Error(
        `Command failed with exit code ${execError.code || 'unknown'}: ${command}\nStderr: ${execError.stderr?.trim() || 'N/A'}\nStdout: ${execError.stdout?.trim() || 'N/A'}\n${execError.message}`
      ) as AugmentedExecError;
      augmentedError.stdout = execError.stdout || '';
      augmentedError.stderr = execError.stderr || '';
      augmentedError.exitCode = typeof execError.code === 'number' ? execError.code : 1;
      augmentedError.originalError = execError; // Keep original error if needed
      logger.debug(messages.shellCommandFailed(command, augmentedError.exitCode), augmentedError);
      throw augmentedError;
    }
  }

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
      // Basic single quoting for shell safety.
      const safeFilePath = `'${filePath.replace(/'/g, "'\\''")}'`;
      const { stdout } = await this.executeShellCommand(`file -b --mime-type ${safeFilePath}`);
      const output = stdout.trim();

      return this.detectFormatByMimeType(output);
    } catch (error) {
      logger.debug(messages.fileCommandFallbackFailed(filePath), error);
      return null;
    }
  }

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

  private buildTarCommand(archivePath: string, tempExtractDir: string, format: string): string {
    let flag: string;
    switch (format) {
      case 'tar.gz':
        flag = '-xzf';
        break;
      case 'tar.bz2':
        flag = '-xjf';
        break;
      case 'tar.xz':
        flag = '-xJf';
        break;
      case 'tar':
        flag = '-xf';
        break;
      default:
        throw new Error(`Unsupported tar format: ${format}`);
    }

    return `tar ${flag} '${archivePath}' -C '${tempExtractDir}'`;
  }

  private async extractArchiveByFormat(
    format: ArchiveFormat,
    archivePath: string,
    tempExtractDir: string
  ): Promise<void> {
    switch (format) {
      case 'tar.gz':
      case 'tar.bz2':
      case 'tar.xz':
      case 'tar': {
        const command = this.buildTarCommand(archivePath, tempExtractDir, format);
        await this.executeShellCommand(command);
        break;
      }
      case 'zip': {
        const command = `unzip -qo '${archivePath}' -d '${tempExtractDir}'`;
        await this.executeShellCommand(command);
        break;
      }
      default:
        throw new Error(`Extraction for format ${format} not implemented.`);
    }
  }

  public async extract(archivePath: string, options: ExtractOptions = {}): Promise<ExtractResult> {
    const logger = this.logger.getSubLogger({ name: 'extract' });
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

    // Get the list of files before extraction
    const filesBefore: string[] = await this.fs.readdir(targetDir).catch(() => []);

    // Extract directly to target directory
    await this.extractArchiveByFormat(format, archivePath, targetDir);

    // Get the list of files after extraction
    const filesAfter = await this.fs.readdir(targetDir);

    // Find the newly extracted files (files that weren't there before)
    const extractedFiles = filesAfter.filter((file) => !filesBefore.includes(file));

    const result: ExtractResult = {
      extractedFiles,
      executables: [],
    };

    if (detectExecutables) {
      result.executables = await this.detectAndSetExecutables(targetDir, extractedFiles);
    }

    return result;
  }

  private async detectAndSetExecutables(baseDir: string, files: string[]): Promise<string[]> {
    const logger = this.logger.getSubLogger({ name: 'detectAndSetExecutables' });
    const executables: string[] = [];
    // This is a simplified check. `file` command is more robust.
    // For `zx`, we'd need to ensure `file` command is available or use Node.js based checks.
    // For now, let's assume a simple extension check or common binary names.
    // A more robust solution would use `await $`file -b ${filePath}`;` and parse output.
    for (const file of files) {
      const filePath = join(baseDir, file);
      try {
        const stat = await this.fs.stat(filePath);
        if (stat.isFile()) {
          // Heuristic: files without extensions or common script extensions
          // This is very basic and platform-dependent.
          const ext = extname(file);
          if (ext === '' || ['.sh', '.py', '.pl', '.rb'].includes(ext)) {
            // Check if it's already executable (owner execute bit)
            if (!(stat.mode & 0o100)) {
              logger.debug(messages.executableFlagApplied(filePath));
              await this.fs.chmod(filePath, stat.mode | 0o100); // Add owner execute
            }
            executables.push(file);
          }
        }
      } catch (error) {
        logger.debug(messages.executableCheckFailed(filePath), error);
      }
    }
    return executables;
  }
}
