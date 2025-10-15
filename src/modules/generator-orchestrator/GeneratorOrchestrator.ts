import type { YamlConfig } from '@modules/config';
import type { IFileSystem } from '@modules/file-system';
import type { GenerateShellInitOptions, IShellInitGenerator } from '@modules/generator-shell-init';
import type { GenerateShimsOptions, IShimGenerator } from '@modules/generator-shim';
import type { GenerateSymlinksOptions, ISymlinkGenerator, SymlinkOperationResult } from '@modules/generator-symlink';
import type { TsLogger } from '@modules/logger';
import { generatorOrchestratorLogMessages } from './log-messages';
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
    const logger = this.logger.getSubLogger({ name: 'constructor' });
    logger.debug(generatorOrchestratorLogMessages.constructor.initialized());
    this.shimGenerator = shimGenerator;
    this.shellInitGenerator = shellInitGenerator;
    this.symlinkGenerator = symlinkGenerator;
    this.fs = fs;
    this.systemInfo = systemInfo;
  }

  async generateAll(toolConfigs: Record<string, ToolConfig>, options?: GenerateAllOptions): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'generateAll' });
    const fileSystemName = this.fs.constructor.name;
    logger.debug(generatorOrchestratorLogMessages.generateAll.methodEntry(fileSystemName), options);

    const toolConfigsCount = toolConfigs ? Object.keys(toolConfigs).length : 0;
    logger.debug(generatorOrchestratorLogMessages.generateAll.parsedOptions(toolConfigsCount));

    // 1. Generate Shims
    const shimOptions: GenerateShimsOptions = { overwrite: true };
    logger.debug(generatorOrchestratorLogMessages.generateAll.shimGenerate(), shimOptions);
    const generatedShimsPaths = await this.shimGenerator.generate(toolConfigs, shimOptions);
    const shimCount = generatedShimsPaths?.length ?? 0;
    logger.debug(generatorOrchestratorLogMessages.generateAll.shimGenerationComplete(shimCount));

    // 2. Generate Shell Init for all supported shells
    const shellInitOptions: GenerateShellInitOptions = {
      shellTypes: ['zsh', 'bash', 'powershell'],
      systemInfo: this.systemInfo,
    };
    logger.debug(generatorOrchestratorLogMessages.generateAll.shellGenerate(), shellInitOptions);
    const shellInitResult = await this.shellInitGenerator.generate(toolConfigs, shellInitOptions);
    const primaryPath = shellInitResult?.primaryPath ?? 'null';
    logger.debug(generatorOrchestratorLogMessages.generateAll.shellInitComplete(primaryPath));

    // 3. Generate Symlinks
    const symlinkOptions: GenerateSymlinksOptions = { overwrite: true, backup: true };
    logger.debug(generatorOrchestratorLogMessages.generateAll.symlinkGenerate(), symlinkOptions);
    const symlinkResults: SymlinkOperationResult[] = await this.symlinkGenerator.generate(toolConfigs, symlinkOptions);
    const symlinkResultCount = symlinkResults?.length ?? 0;
    logger.debug(generatorOrchestratorLogMessages.generateAll.symlinkGenerationComplete(symlinkResultCount));

    logger.debug(generatorOrchestratorLogMessages.generateAll.completed(fileSystemName));
  }
}
