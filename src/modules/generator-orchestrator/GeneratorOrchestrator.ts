import path from 'node:path';
import type { YamlConfig } from '@modules/config';
import type { IFileSystem } from '@modules/file-system';
import type { GenerateShellInitOptions, IShellInitGenerator } from '@modules/generator-shell-init';
import type { GenerateShimsOptions, IShimGenerator } from '@modules/generator-shim';
import type { GenerateSymlinksOptions, ISymlinkGenerator, SymlinkOperationResult } from '@modules/generator-symlink';
import { logs, type TsLogger } from '@modules/logger';
import type { GeneratedArtifactsManifest, SystemInfo, ToolConfig } from '@types';
import type { GenerateAllOptions, IGeneratorOrchestrator } from './IGeneratorOrchestrator';

export class GeneratorOrchestrator implements IGeneratorOrchestrator {
  private readonly logger: TsLogger;
  private readonly shimGenerator: IShimGenerator;
  private readonly shellInitGenerator: IShellInitGenerator;
  private readonly symlinkGenerator: ISymlinkGenerator;
  private readonly fs: IFileSystem;
  private readonly appConfig: YamlConfig;
  private readonly systemInfo: SystemInfo;

  constructor(
    parentLogger: TsLogger,
    shimGenerator: IShimGenerator,
    shellInitGenerator: IShellInitGenerator,
    symlinkGenerator: ISymlinkGenerator,
    fs: IFileSystem,
    appConfig: YamlConfig,
    systemInfo: SystemInfo
  ) {
    this.logger = parentLogger.getSubLogger({ name: 'GeneratorOrchestrator' });
    this.logger.debug(logs.generator.debug.orchestratorInit());
    this.shimGenerator = shimGenerator;
    this.shellInitGenerator = shellInitGenerator;
    this.symlinkGenerator = symlinkGenerator;
    this.fs = fs;
    this.appConfig = appConfig;
    this.systemInfo = systemInfo;
  }

  async generateAll(
    toolConfigs: Record<string, ToolConfig>,
    options?: GenerateAllOptions
  ): Promise<GeneratedArtifactsManifest> {
    const logger = this.logger.getSubLogger({ name: 'generateAll' });
    logger.debug(logs.generator.debug.methodEntry(), options, this.fs.constructor.name);
    logger.debug(logs.generator.debug.manifestPath(), this.appConfig.paths.manifestPath);

    const generatorVersion = options?.generatorVersion;
    const toolConfigsCount = toolConfigs ? Object.keys(toolConfigs).length : 0;

    logger.debug(logs.generator.debug.parsedOptions(), generatorVersion, toolConfigsCount);

    if (!this.appConfig) {
      logger.debug(logs.generator.debug.configCritical());
      throw new Error('GeneratorOrchestrator: AppConfig is not available.');
    }
    logger.debug(logs.generator.debug.yamlConfigAvailable(), this.appConfig.paths.manifestPath);

    if (!this.appConfig.paths.manifestPath) {
      logger.debug(logs.generator.debug.pathsCritical());
      throw new Error('GeneratorOrchestrator: YamlConfig.paths.manifestPath is missing.');
    }
    const manifestPath = this.appConfig.paths.manifestPath;
    logger.debug(logs.generator.debug.manifestPathDetermined(), manifestPath);

    let currentManifest: GeneratedArtifactsManifest;

    logger.debug(logs.generator.debug.manifestRead(), this.fs.constructor.name);
    try {
      const manifestFileExists = await this.fs.exists(manifestPath);
      logger.debug(logs.generator.debug.fsExistsCompleted(), manifestFileExists);

      if (manifestFileExists) {
        logger.debug(logs.generator.debug.existingManifestFound(), manifestPath);
        const fileContent = await this.fs.readFile(manifestPath);
        logger.debug(logs.generator.debug.readFileCompleted());
        currentManifest = JSON.parse(fileContent) as GeneratedArtifactsManifest;
        logger.debug(logs.generator.debug.existingManifest());
      } else {
        logger.debug(logs.generator.debug.noExistingManifest(), manifestPath);
        currentManifest = {
          lastGenerated: '', // Will be updated
          shims: [],
          symlinks: [],
          // shellInit will be populated by sub-generator
        };
      }
    } catch (error) {
      logger.debug(
        logs.generator.debug.manifestReadError(),
        manifestPath,
        error instanceof Error ? error.message : String(error)
      );
      currentManifest = {
        lastGenerated: '', // Will be updated
        shims: [],
        symlinks: [],
      };
    }
    if (generatorVersion) {
      currentManifest.generatorVersion = generatorVersion;
    }

    // 1. Generate Shims
    // dryRun is removed; IFileSystem handles behavior
    const shimOptions: GenerateShimsOptions = { overwrite: true };
    logger.debug(logs.generator.debug.shimGenerate(), shimOptions);
    const generatedShimsPaths = await this.shimGenerator.generate(toolConfigs, shimOptions);
    currentManifest.shims = generatedShimsPaths;
    logger.debug(logs.generator.debug.shimGenerationComplete(), currentManifest.shims?.length ?? 0);

    // 2. Generate Shell Init for all supported shells
    // dryRun is removed; IFileSystem handles behavior
    const shellInitOptions: GenerateShellInitOptions = {
      shellTypes: ['zsh', 'bash', 'powershell'],
      systemInfo: this.systemInfo,
    };
    logger.debug(logs.generator.debug.shellGenerate(), shellInitOptions);
    const shellInitResult = await this.shellInitGenerator.generate(toolConfigs, shellInitOptions);
    currentManifest.shellInit = { path: shellInitResult?.primaryPath ?? null };
    logger.debug(logs.generator.debug.shellInitComplete(), currentManifest.shellInit?.path ?? 'null');

    // 3. Generate Symlinks
    // dryRun is removed; IFileSystem handles behavior
    const symlinkOptions: GenerateSymlinksOptions = { overwrite: true, backup: true };
    logger.debug(logs.generator.debug.symlinkGenerate(), symlinkOptions);
    const symlinkResults: SymlinkOperationResult[] = await this.symlinkGenerator.generate(toolConfigs, symlinkOptions);
    currentManifest.symlinks = symlinkResults;
    logger.debug(logs.generator.debug.symlinkGenerationComplete(), currentManifest.symlinks?.length ?? 0);

    // Update timestamp
    currentManifest.lastGenerated = new Date().toISOString(); // Use new field name

    // Manifest writing behavior is now solely determined by the injected IFileSystem type
    try {
      logger.debug(logs.generator.debug.writingManifest(), manifestPath, this.fs.constructor.name);
      const manifestDir = path.dirname(manifestPath);
      await this.fs.ensureDir(manifestDir);
      await this.fs.writeFile(manifestPath, JSON.stringify(currentManifest, null, 2));
      logger.debug(logs.generator.debug.manifestWritten());
    } catch (error) {
      logger.debug(
        logs.generator.debug.manifestWriteFailed(),
        manifestPath,
        error instanceof Error ? error.message : String(error)
      );
      // Potentially re-throw or handle more gracefully depending on requirements
    }

    logger.debug(logs.generator.debug.orchestrationComplete(), this.fs.constructor.name);
    return currentManifest;
  }
}
