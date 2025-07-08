/**
 * @file generator/src/modules/extractor/ArchiveExtractor.ts
 * @description Implementation of IArchiveExtractor using system commands via zx.
 */

import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';
// Fully remove zx imports now
import { basename, extname, join } from 'node:path';
import type { IArchiveExtractor } from './IArchiveExtractor';
import type { ArchiveFormat, ExtractOptions, ExtractResult } from '@types';
import type { IFileSystem } from '@modules/file-system';
import { createLogger } from '@modules/logger';

const log = createLogger('ArchiveExtractor');

/**
 * Implements the IArchiveExtractor interface using system commands.
 *
 * @remarks
 * This module has a hard dependency on system commands like `tar`, `unzip`,
 * and `file` being available on the system's PATH.
 *
 * The `stripComponents` option is only effective for `tar`-based archives
 * and is ignored for `.zip` files due to limitations of the standard `unzip`
 * command.
 */
export class ArchiveExtractor implements IArchiveExtractor {
  private fs: IFileSystem;

  constructor(fileSystem: IFileSystem) {
    this.fs = fileSystem;
  }

  // Promisify exec for use with async/await
  private promisedExec = promisify(execCallback);

  /**
   * Executes a shell command using child_process.exec.
   * @param command The command string to execute.
   * @returns A promise that resolves with an object containing stdout, stderr, and exitCode.
   * @throws An error object augmented with stdout, stderr, and exitCode if the command fails.
   */
  private async executeShellCommand(
    command: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      log('Executing shell command: %s', command);
      const { stdout, stderr } = await this.promisedExec(command);
      return { stdout, stderr, exitCode: 0 };
    } catch (error: any) {
      // Augment the error object with stdio and exit code
      const execError = new Error(
        `Command failed with exit code ${error.code || 'unknown'}: ${command}\nStderr: ${error.stderr?.trim() || 'N/A'}\nStdout: ${error.stdout?.trim() || 'N/A'}\n${error.message}`
      ) as any;
      execError.stdout = error.stdout || '';
      execError.stderr = error.stderr || '';
      execError.exitCode = typeof error.code === 'number' ? error.code : 1;
      execError.originalError = error; // Keep original error if needed
      log('executeShellCommand error: %o', execError);
      throw execError;
    }
  }

  public async detectFormat(filePath: string): Promise<ArchiveFormat> {
    const fileName = basename(filePath).toLowerCase();
    if (fileName.endsWith('.tar.gz') || fileName.endsWith('.tgz')) return 'tar.gz';
    if (fileName.endsWith('.tar.bz2') || fileName.endsWith('.tbz2') || fileName.endsWith('.tbz'))
      return 'tar.bz2';
    if (fileName.endsWith('.tar.xz') || fileName.endsWith('.txz')) return 'tar.xz';
    if (fileName.endsWith('.tar.lzma')) return 'tar.lzma';
    if (fileName.endsWith('.tar')) return 'tar';
    if (fileName.endsWith('.zip')) return 'zip';
    if (fileName.endsWith('.rar')) return 'rar';
    if (fileName.endsWith('.7z')) return '7z';
    if (fileName.endsWith('.deb')) return 'deb';
    if (fileName.endsWith('.rpm')) return 'rpm';
    if (fileName.endsWith('.dmg')) return 'dmg';

    // Fallback to 'file' command
    try {
      // Basic single quoting for shell safety.
      const safeFilePath = `'${filePath.replace(/'/g, "'\\''")}'`;
      const { stdout } = await this.executeShellCommand(`file -b --mime-type ${safeFilePath}`);
      const output = stdout.trim();

      if (output.includes('gzip')) return 'tar.gz';
      if (output.includes('zip')) return 'zip';
      if (output.includes('x-bzip2')) return 'tar.bz2';
      if (output.includes('x-xz')) return 'tar.xz';
      if (output.includes('x-tar')) return 'tar';
      if (output.includes('x-7z-compressed')) return '7z';
      if (output.includes('x-rar-compressed')) return 'rar';
      if (output.includes('x-debian-package')) return 'deb';
      if (output.includes('x-rpm')) return 'rpm';
      if (output.includes('x-apple-diskimage')) return 'dmg';
    } catch (error) {
      log('detectFormat: "file" command failed during fallback. Error: %o', error);
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

  public async extract(archivePath: string, options: ExtractOptions = {}): Promise<ExtractResult> {
    const {
      format: explicitFormat,
      stripComponents = 0,
      targetDir = '.', // Default to current directory if not specified
      // preservePermissions = false, // TODO: Implement if needed via tar/unzip options
      detectExecutables = true,
    } = options;

    log('extract: archivePath=%s, options=%o', archivePath, options);

    const format = explicitFormat || (await this.detectFormat(archivePath));

    if (!this.isSupported(format)) {
      throw new Error(`Unsupported archive format: ${format}`);
    }

    // Ensure target directory exists
    await this.fs.ensureDir(targetDir);

    const tempExtractDir = join(targetDir, `_extract_${Date.now()}`);
    await this.fs.mkdir(tempExtractDir, { recursive: true });

    try {
      switch (format) {
        case 'tar.gz': {
          // Handles .tgz as detectFormat resolves it to 'tar.gz'
          let command = `tar -xzf '${archivePath}' -C '${tempExtractDir}'`;
          if (stripComponents > 0) {
            command += ` --strip-components=${stripComponents}`;
          }
          await this.executeShellCommand(command);
          break;
        }
        case 'tar.bz2': {
          // Handles .tbz2, .tbz as detectFormat resolves them
          let command = `tar -xjf '${archivePath}' -C '${tempExtractDir}'`;
          if (stripComponents > 0) {
            command += ` --strip-components=${stripComponents}`;
          }
          await this.executeShellCommand(command);
          break;
        }
        case 'tar.xz': {
          // Handles .txz as detectFormat resolves it
          let command = `tar -xJf '${archivePath}' -C '${tempExtractDir}'`;
          if (stripComponents > 0) {
            command += ` --strip-components=${stripComponents}`;
          }
          await this.executeShellCommand(command);
          break;
        }
        case 'tar': {
          let command = `tar -xf '${archivePath}' -C '${tempExtractDir}'`;
          if (stripComponents > 0) {
            command += ` --strip-components=${stripComponents}`;
          }
          await this.executeShellCommand(command);
          break;
        }
        case 'zip': {
          // unzip doesn't have a direct --strip-components.
          // If needed, would require extracting to a subdir and then moving.
          // For now, we ignore stripComponents for zip or require user to handle.
          if (stripComponents > 0) {
            log(
              'extract: --strip-components is not directly supported for zip, files will be extracted with full paths into target.'
            );
            // A more complex solution would be to extract to a temporary unique dir inside tempExtractDir,
            // then list contents, find the common base (if stripComponents=1 and it's a single dir), and move.
          }
          const command = `unzip -qo '${archivePath}' -d '${tempExtractDir}'`;
          await this.executeShellCommand(command);
          break;
        }
        // TODO: Implement other formats (rar, 7z, deb, rpm, dmg)
        // case '7z':
        //   await $`7z x ${archivePath} -o${tempExtractDir} -y`;
        //   break;
        default:
          throw new Error(`Extraction for format ${format} not implemented.`);
      }

      // Move contents from tempExtractDir to targetDir if stripComponents was handled by tar
      // or if it's a simple extraction.
      // If stripComponents was > 0 for zip, this part needs more complex logic.
      // For now, assume files are where they should be relative to tempExtractDir.
      const extractedItems = await this.fs.readdir(tempExtractDir);
      for (const item of extractedItems) {
        await this.fs.rename(join(tempExtractDir, item), join(targetDir, item));
      }

      // Clean up the (now empty) temporary extraction directory after successful move
      await this.fs.rm(tempExtractDir, { recursive: true, force: true });

      const result: ExtractResult = {
        extractedFiles: await this.fs.readdir(targetDir), // Re-read targetDir for final list
        executables: [],
        // rootDir logic might be complex if stripComponents is involved.
      };

      if (detectExecutables) {
        result.executables = await this.detectAndSetExecutables(targetDir, result.extractedFiles);
      }
      return result;
    } catch (error) {
      // Ensure tempExtractDir is cleaned up even if an error occurs during extraction or moving files.
      // This was previously handled by the finally block, but since the Installer
      // now needs tempExtractDir to exist *after* this method returns successfully,
      // we only clean up here on error within this method's scope.
      // The Installer is responsible for cleanup on successful return.
      log(
        'Error during extract process, cleaning up temp dir: %s. Error: %o',
        tempExtractDir,
        error
      );
      await this.fs.rm(tempExtractDir, { recursive: true, force: true }).catch((cleanupErr) => {
        log('Error during cleanup of temp dir after an error: %o', cleanupErr);
      });
      throw error; // Re-throw the original error
    }
    // The finally block was removed. Cleanup on successful completion is handled by the caller.
  }

  private async detectAndSetExecutables(baseDir: string, files: string[]): Promise<string[]> {
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
              log('detectAndSetExecutables: Setting +x for %s', filePath);
              await this.fs.chmod(filePath, stat.mode | 0o100); // Add owner execute
            }
            executables.push(file);
          }
        }
      } catch (err) {
        log('detectAndSetExecutables: Error stating or chmoding file %s: %o', filePath, err);
      }
    }
    return executables;
  }
}
