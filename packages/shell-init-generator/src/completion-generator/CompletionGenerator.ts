import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type { ArchiveFormat, Shell, ShellCompletionConfig, ShellType } from '@dotfiles/core';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { getAllFilesRecursively, resolveToolRelativePath } from '@dotfiles/utils';
import { minimatch } from 'minimatch';
import path from 'node:path';
import { CompletionCommandExecutor } from './CompletionCommandExecutor';
import { messages } from './log-messages';
import type {
  ICompletionCommandExecutor,
  ICompletionGenerationContext,
  ICompletionGenerator,
  IGenerateAndWriteCompletionFileOptions,
  IGeneratedCompletion,
} from './types';

const ARCHIVE_EXTENSIONS: ArchiveFormat[] = ['tar.gz', 'tar.xz', 'tar.bz2', 'zip', 'tar', 'tar.lzma', '7z'];

export interface ICompletionGeneratorDependencies {
  downloader?: IDownloader;
  archiveExtractor?: IArchiveExtractor;
}

export class CompletionGenerator implements ICompletionGenerator {
  private readonly logger: TsLogger;
  private readonly commandExecutor: ICompletionCommandExecutor;
  private readonly fs: IFileSystem;
  private readonly downloader?: IDownloader;
  private readonly archiveExtractor?: IArchiveExtractor;

  constructor(
    parentLogger: TsLogger,
    fs: IFileSystem,
    shell: Shell,
    commandExecutor?: ICompletionCommandExecutor,
    deps?: ICompletionGeneratorDependencies,
  ) {
    this.logger = parentLogger.getSubLogger({ name: 'CompletionGenerator' });
    this.fs = fs;
    this.commandExecutor = commandExecutor || new CompletionCommandExecutor(this.logger, shell);
    this.downloader = deps?.downloader;
    this.archiveExtractor = deps?.archiveExtractor;
  }

  async prepareUrlCompletionSource(
    config: ShellCompletionConfig,
    toolName: string,
    context: ICompletionGenerationContext,
  ): Promise<string> {
    if (!config.url) {
      throw new Error(`URL not provided for ${toolName}`);
    }

    await this.downloadCompletionFromUrl(config.url, context.toolInstallDir, toolName);

    const effectiveSource = config.source || this.getFilenameFromUrl(config.url);
    const sourcePath = path.isAbsolute(effectiveSource)
      ? effectiveSource
      : path.join(context.toolInstallDir, effectiveSource);

    if (!(await this.fs.exists(sourcePath))) {
      this.logger.warn(messages.sourceNotFound(sourcePath));
      throw new Error(`Completion source file not found: ${sourcePath}`);
    }

    return sourcePath;
  }

  async generateCompletionFile(
    config: ShellCompletionConfig,
    toolName: string,
    shellType: ShellType,
    context: ICompletionGenerationContext,
  ): Promise<IGeneratedCompletion> {
    const logger = this.logger.getSubLogger({ name: 'generateCompletionFile' }).setPrefix(toolName);
    logger.debug(messages.generationStarted(toolName, shellType));

    const effectiveSource = config.url
      ? await this.prepareUrlCompletionSource(config, toolName, context)
      : config.source;

    if (config.cmd) {
      return this.generateFromCommand(config, toolName, shellType, context);
    }

    if (effectiveSource) {
      const effectiveConfig: ShellCompletionConfig = { ...config, source: effectiveSource };
      return this.generateFromSource(effectiveConfig, toolName, shellType, context);
    }

    throw new Error(`Invalid completion config for ${toolName}: either 'cmd', 'source', or 'url' must be provided`);
  }

  /**
   * Downloads a completion file or archive from a URL.
   * If the URL points to an archive, it will be extracted to the tool's install directory.
   */
  private async downloadCompletionFromUrl(url: string, toolInstallDir: string, toolName: string): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'downloadCompletionFromUrl' }).setPrefix(toolName);

    if (!this.downloader) {
      throw new Error('Downloader not provided - cannot download completion from URL');
    }

    logger.info(messages.downloadingCompletion(url));

    // Ensure the tool install directory exists
    await this.fs.ensureDir(toolInstallDir);

    const filename = this.getFilenameFromUrl(url);
    const downloadPath = path.join(toolInstallDir, filename);

    // Check if already downloaded
    if (await this.fs.exists(downloadPath)) {
      logger.debug(messages.completionAlreadyDownloaded(downloadPath));
      return;
    }

    await this.downloader.downloadToFile(logger, url, downloadPath);
    logger.debug(messages.completionDownloaded(downloadPath));

    // Check if it's an archive that needs extraction
    const archiveFormat = this.detectArchiveFormat(filename);
    if (archiveFormat) {
      await this.extractCompletionArchive(downloadPath, toolInstallDir, toolName);
    }
  }

  /**
   * Extracts a completion archive to the tool's install directory.
   */
  private async extractCompletionArchive(archivePath: string, toolInstallDir: string, toolName: string): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'extractCompletionArchive' }).setPrefix(toolName);

    if (!this.archiveExtractor) {
      throw new Error('Archive extractor not provided - cannot extract completion archive');
    }

    logger.debug(messages.extractingCompletionArchive(archivePath));
    await this.archiveExtractor.extract(logger, archivePath, {
      targetDir: toolInstallDir,
    });
    logger.debug(messages.completionArchiveExtracted(toolInstallDir));
  }

  /**
   * Extracts the filename from a URL.
   */
  private getFilenameFromUrl(url: string): string {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = path.basename(pathname);
    return filename || 'completion-download';
  }

  /**
   * Detects if a filename indicates an archive format.
   */
  private detectArchiveFormat(filename: string): ArchiveFormat | null {
    const lowerFilename = filename.toLowerCase();
    for (const format of ARCHIVE_EXTENSIONS) {
      if (lowerFilename.endsWith(`.${format}`)) {
        return format;
      }
    }
    return null;
  }

  /**
   * Generates and writes a completion file in one operation.
   * For command-based completions, writes the generated content to a file.
   * For source-based completions, creates a symlink to the source file.
   *
   * @param options - Generation options including optional fs override for tracking.
   */
  async generateAndWriteCompletionFile(options: IGenerateAndWriteCompletionFileOptions): Promise<IGeneratedCompletion> {
    const { config, toolName, shellType, context, fs } = options;

    const result = await this.generateCompletionFile(config, toolName, shellType, context);

    await fs.ensureDir(path.dirname(result.targetPath));

    if (result.generatedBy === 'source' && result.sourcePath) {
      // For source-based completions, create a symlink
      if (await fs.exists(result.targetPath)) {
        await fs.rm(result.targetPath);
      }
      await fs.symlink(result.sourcePath, result.targetPath);
      this.logger.debug(messages.symlinkCreated(result.sourcePath, result.targetPath));
    } else {
      // For command-based completions, write the content
      await fs.writeFile(result.targetPath, result.content);
    }

    return result;
  }

  private async generateFromCommand(
    config: ShellCompletionConfig,
    toolName: string,
    shellType: ShellType,
    context: ICompletionGenerationContext,
  ): Promise<IGeneratedCompletion> {
    if (!config.cmd) {
      throw new Error(`Command not provided for ${toolName}`);
    }

    const content = await this.commandExecutor.executeCompletionCommand(
      config.cmd,
      toolName,
      shellType,
      context.toolInstallDir,
      context.binaryPaths,
    );

    const filename = this.generateCompletionFilename(config, toolName, shellType);
    const targetPath = this.resolveTargetPath(shellType, context);

    return {
      content,
      filename,
      targetPath: path.join(targetPath, filename),
      generatedBy: 'command',
    };
  }

  private async generateFromSource(
    config: ShellCompletionConfig,
    toolName: string,
    shellType: ShellType,
    context: ICompletionGenerationContext,
  ): Promise<IGeneratedCompletion> {
    if (!config.source) {
      throw new Error(`Source not provided for ${toolName}`);
    }

    const sourcePath = await this.resolveSourcePath(config.source, context.configFilePath);

    if (!(await this.fs.exists(sourcePath))) {
      this.logger.warn(messages.sourceNotFound(sourcePath));
      throw new Error(`Completion source file not found: ${sourcePath}`);
    }

    const filename = this.generateCompletionFilename(config, toolName, shellType);
    const targetPath = this.resolveTargetPath(shellType, context);

    return {
      content: '', // No content needed for symlink-based completions
      filename,
      targetPath: path.join(targetPath, filename),
      generatedBy: 'source',
      sourcePath,
    };
  }

  /**
   * Resolves the source path for a completion file.
   *
   * Resolution:
   * 1. Absolute paths are used as-is
   * 2. Relative paths resolve to toolDir (directory containing the .tool.ts file)
   */
  private async resolveSourcePath(source: string, configFilePath?: string): Promise<string> {
    // Absolute paths are used as-is
    if (path.isAbsolute(source)) {
      return source;
    }

    // Determine toolDir from configFilePath
    const toolDir = configFilePath ? path.dirname(configFilePath) : undefined;

    if (!toolDir) {
      throw new Error(`Cannot resolve relative path '${source}' without configFilePath`);
    }

    // If source contains glob patterns, search in toolDir
    if (source.includes('*') || source.includes('?') || source.includes('[')) {
      const toolDirFiles = await getAllFilesRecursively(this.fs, toolDir, toolDir);
      const matchedInToolDir = toolDirFiles.find((file) => minimatch(file, source));
      if (matchedInToolDir) {
        return path.join(toolDir, matchedInToolDir);
      }
      throw new Error(`No files matching pattern '${source}' found in toolDir: ${toolDir}`);
    }

    // For non-glob paths, resolve relative to toolDir
    return resolveToolRelativePath(toolDir, source);
  }

  /**
   * Generates the completion filename based on config and shell type.
   *
   * Priority order:
   * 1. config.bin - binary name with shell-specific naming applied
   * 2. toolName - fallback to tool name with shell-specific naming
   */
  private generateCompletionFilename(config: ShellCompletionConfig, toolName: string, shellType: ShellType): string {
    const baseName = config.bin ?? toolName;

    switch (shellType) {
      case 'zsh':
        return `_${baseName}`;
      case 'bash':
        return `${baseName}.bash`;
      case 'powershell':
        return `${baseName}.ps1`;
      default:
        return `${baseName}.${shellType}`;
    }
  }

  private resolveTargetPath(shellType: ShellType, context: ICompletionGenerationContext): string {
    return path.join(context.shellScriptsDir, shellType, 'completions');
  }
}
