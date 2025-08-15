import type { YamlConfig } from '@modules/config';
import type { IFileSystem } from '@modules/file-system';
import type { GenerateShellInitOptions, IShellInitGenerator } from '@modules/generator-shell-init';
import type { GenerateShimsOptions, IShimGenerator } from '@modules/generator-shim';
import type { GenerateSymlinksOptions, ISymlinkGenerator, SymlinkOperationResult } from '@modules/generator-symlink';
import { logs, type TsLogger } from '@modules/logger';
import type { SystemInfo, ToolConfig } from '@types';
import type { GenerateAllOptions, IGeneratorOrchestrator } from './IGeneratorOrchestrator';

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
    _appConfig: YamlConfig,
    systemInfo: SystemInfo
  ) {
    this.logger = parentLogger.getSubLogger({ name: 'GeneratorOrchestrator' });
    this.logger.debug(logs.generator.debug.orchestratorInit());
    this.shimGenerator = shimGenerator;
    this.shellInitGenerator = shellInitGenerator;
    this.symlinkGenerator = symlinkGenerator;
    this.fs = fs;
    this.systemInfo = systemInfo;
  }

  async generateAll(toolConfigs: Record<string, ToolConfig>, options?: GenerateAllOptions): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'generateAll' });
    logger.debug(logs.generator.debug.methodEntry(), options, this.fs.constructor.name);

    const toolConfigsCount = toolConfigs ? Object.keys(toolConfigs).length : 0;
    logger.debug(logs.generator.debug.parsedOptions(), toolConfigsCount);

    // 1. Generate Shims
    const shimOptions: GenerateShimsOptions = { overwrite: true };
    logger.debug(logs.generator.debug.shimGenerate(), shimOptions);
    const generatedShimsPaths = await this.shimGenerator.generate(toolConfigs, shimOptions);
    logger.debug(logs.generator.debug.shimGenerationComplete(), generatedShimsPaths?.length ?? 0);

    // 2. Generate Shell Init for all supported shells
    const shellInitOptions: GenerateShellInitOptions = {
      shellTypes: ['zsh', 'bash', 'powershell'],
      systemInfo: this.systemInfo,
    };
    logger.debug(logs.generator.debug.shellGenerate(), shellInitOptions);
    const shellInitResult = await this.shellInitGenerator.generate(toolConfigs, shellInitOptions);
    logger.debug(logs.generator.debug.shellInitComplete(), shellInitResult?.primaryPath ?? 'null');

    // 3. Generate Symlinks
    const symlinkOptions: GenerateSymlinksOptions = { overwrite: true, backup: true };
    logger.debug(logs.generator.debug.symlinkGenerate(), symlinkOptions);
    const symlinkResults: SymlinkOperationResult[] = await this.symlinkGenerator.generate(toolConfigs, symlinkOptions);
    logger.debug(logs.generator.debug.symlinkGenerationComplete(), symlinkResults?.length ?? 0);

    logger.debug(logs.generator.debug.orchestrationComplete(), this.fs.constructor.name);
  }
}
