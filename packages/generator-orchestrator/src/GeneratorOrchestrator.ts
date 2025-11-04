import type { SystemInfo, ToolConfig } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import type { GenerateShellInitOptions, IShellInitGenerator } from '@dotfiles/shell-init-generator';
import type { GenerateShimsOptions, IShimGenerator } from '@dotfiles/shim-generator';
import type { GenerateSymlinksOptions, ISymlinkGenerator, SymlinkOperationResult } from '@dotfiles/symlink-generator';
import type { IGeneratorOrchestrator } from './IGeneratorOrchestrator';
import { messages } from './log-messages';

export class GeneratorOrchestrator implements IGeneratorOrchestrator {
  private readonly logger: TsLogger;
  private readonly shimGenerator: IShimGenerator;
  private readonly shellInitGenerator: IShellInitGenerator;
  private readonly symlinkGenerator: ISymlinkGenerator;
  private readonly fs: IFileSystem;
  private readonly systemInfo: SystemInfo;

  constructor(
    parentLogger: TsLogger,
    shimGenerator: IShimGenerator,
    shellInitGenerator: IShellInitGenerator,
    symlinkGenerator: ISymlinkGenerator,
    fs: IFileSystem,
    systemInfo: SystemInfo
  ) {
    this.logger = parentLogger.getSubLogger({ name: 'GeneratorOrchestrator' });
    const logger = this.logger.getSubLogger({ name: 'constructor' });
    logger.debug(messages.constructor.initialized());
    this.shimGenerator = shimGenerator;
    this.shellInitGenerator = shellInitGenerator;
    this.symlinkGenerator = symlinkGenerator;
    this.fs = fs;
    this.systemInfo = systemInfo;
  }

  async generateAll(toolConfigs: Record<string, ToolConfig>): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'generateAll' });
    const fileSystemName = this.fs.constructor.name;

    const toolConfigsCount = toolConfigs ? Object.keys(toolConfigs).length : 0;
    logger.debug(messages.generateAll.parsedOptions(toolConfigsCount));

    // 1. Generate Shims
    const shimOptions: GenerateShimsOptions = { overwrite: true };
    logger.debug(messages.generateAll.shimGenerate());
    const generatedShimsPaths = await this.shimGenerator.generate(toolConfigs, shimOptions);
    const shimCount = generatedShimsPaths?.length ?? 0;
    logger.debug(messages.generateAll.shimGenerationComplete(shimCount));

    // 2. Generate Shell Init for all supported shells
    const shellInitOptions: GenerateShellInitOptions = {
      shellTypes: ['zsh', 'bash', 'powershell'],
      systemInfo: this.systemInfo,
    };
    logger.debug(messages.generateAll.shellGenerate());
    const shellInitResult = await this.shellInitGenerator.generate(toolConfigs, shellInitOptions);
    const primaryPath = shellInitResult?.primaryPath ?? 'null';
    logger.debug(messages.generateAll.shellInitComplete(primaryPath));

    // 3. Generate Symlinks
    const symlinkOptions: GenerateSymlinksOptions = { overwrite: true, backup: true };
    const symlinkResults: SymlinkOperationResult[] = await this.symlinkGenerator.generate(toolConfigs, symlinkOptions);
    const symlinkResultCount = symlinkResults?.length ?? 0;
    logger.debug(messages.generateAll.symlinkGenerationComplete(symlinkResultCount));

    logger.debug(messages.generateAll.completed(fileSystemName));
  }
}
