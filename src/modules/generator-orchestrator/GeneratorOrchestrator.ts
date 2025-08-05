import path from 'node:path';
import type { IFileSystem } from '@modules/file-system';
import type { YamlConfig } from '@modules/config';
import type { GeneratedArtifactsManifest, ToolConfig } from '@types';
import type { IShimGenerator, GenerateShimsOptions } from '@modules/generator-shim';
import type { IShellInitGenerator, GenerateShellInitOptions } from '@modules/generator-shell-init';
import type {
  ISymlinkGenerator,
  GenerateSymlinksOptions,
  SymlinkOperationResult,
} from '@modules/generator-symlink';
import type { IGeneratorOrchestrator, GenerateAllOptions } from './IGeneratorOrchestrator';
import { type TsLogger } from '@modules/logger';
import { DebugTemplates } from '@modules/shared/ErrorTemplates';

export class GeneratorOrchestrator implements IGeneratorOrchestrator {
  private readonly logger: TsLogger;
  private readonly shimGenerator: IShimGenerator;
  private readonly shellInitGenerator: IShellInitGenerator;
  private readonly symlinkGenerator: ISymlinkGenerator;
  private readonly fs: IFileSystem;
  private readonly appConfig: YamlConfig;

  constructor(
    parentLogger: TsLogger,
    shimGenerator: IShimGenerator,
    shellInitGenerator: IShellInitGenerator,
    symlinkGenerator: ISymlinkGenerator,
    fs: IFileSystem,
    appConfig: YamlConfig
  ) {
    this.logger = parentLogger.getSubLogger({ name: 'GeneratorOrchestrator' });
    this.logger.debug(DebugTemplates.generator.orchestratorInit());
    this.shimGenerator = shimGenerator;
    this.shellInitGenerator = shellInitGenerator;
    this.symlinkGenerator = symlinkGenerator;
    this.fs = fs;
    this.appConfig = appConfig;
  }

  async generateAll(
    toolConfigs: Record<string, ToolConfig>,
    options?: GenerateAllOptions
  ): Promise<GeneratedArtifactsManifest> {
    const logger = this.logger.getSubLogger({ name: 'generateAll' });
    logger.debug(DebugTemplates.generator.methodEntry(), options, this.fs.constructor.name);
    logger.debug(DebugTemplates.generator.manifestPath(), this.appConfig.paths.manifestPath);

    const generatorVersion = options?.generatorVersion;
    const toolConfigsCount = toolConfigs ? Object.keys(toolConfigs).length : 0;

    logger.debug(DebugTemplates.generator.parsedOptions(), generatorVersion, toolConfigsCount);

    if (!this.appConfig) {
      logger.debug(DebugTemplates.generator.configCritical());
      throw new Error('GeneratorOrchestrator: AppConfig is not available.');
    }
    logger.debug(DebugTemplates.generator.yamlConfigAvailable(), this.appConfig.paths.manifestPath);

    if (!this.appConfig.paths.manifestPath) {
      logger.debug(DebugTemplates.generator.pathsCritical());
      throw new Error(
        'GeneratorOrchestrator: YamlConfig.paths.manifestPath is missing.'
      );
    }
    const manifestPath = this.appConfig.paths.manifestPath;
    logger.debug(DebugTemplates.generator.manifestPathDetermined(), manifestPath);

    let currentManifest: GeneratedArtifactsManifest;

    logger.debug(DebugTemplates.generator.manifestRead(), this.fs.constructor.name);
    try {
      const manifestFileExists = await this.fs.exists(manifestPath);
      logger.debug(DebugTemplates.generator.fsExistsCompleted(), manifestFileExists);

      if (manifestFileExists) {
        logger.debug(DebugTemplates.generator.existingManifestFound(), manifestPath);
        const fileContent = await this.fs.readFile(manifestPath);
        logger.debug(DebugTemplates.generator.readFileCompleted());
        currentManifest = JSON.parse(fileContent) as GeneratedArtifactsManifest;
        logger.debug(DebugTemplates.generator.existingManifest());
      } else {
        logger.debug(DebugTemplates.generator.noExistingManifest(), manifestPath);
        currentManifest = {
          lastGenerated: '', // Will be updated
          shims: [],
          symlinks: [],
          // shellInit will be populated by sub-generator
        };
      }
    } catch (error) {
      logger.debug(DebugTemplates.generator.manifestReadError(), manifestPath, error instanceof Error ? error.message : String(error));
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
    logger.debug(DebugTemplates.generator.shimGenerate(), shimOptions);
    const generatedShimsPaths = await this.shimGenerator.generate(toolConfigs, shimOptions);
    currentManifest.shims = generatedShimsPaths;
    logger.debug(DebugTemplates.generator.shimGenerationComplete(), currentManifest.shims?.length ?? 0);

    // 2. Generate Shell Init
    // dryRun is removed; IFileSystem handles behavior
    const shellInitOptions: GenerateShellInitOptions = {}; // Add other options if any in future
    logger.debug(DebugTemplates.generator.shellGenerate(), shellInitOptions);
    const generatedShellInitPath = await this.shellInitGenerator.generate(
      toolConfigs,
      shellInitOptions
    );
    currentManifest.shellInit = { path: generatedShellInitPath };
    logger.debug(DebugTemplates.generator.shellInitComplete(), currentManifest.shellInit?.path ?? 'null');

    // 3. Generate Symlinks
    // dryRun is removed; IFileSystem handles behavior
    const symlinkOptions: GenerateSymlinksOptions = { overwrite: true, backup: true };
    logger.debug(DebugTemplates.generator.symlinkGenerate(), symlinkOptions);
    const symlinkResults: SymlinkOperationResult[] = await this.symlinkGenerator.generate(
      toolConfigs,
      symlinkOptions
    );
    currentManifest.symlinks = symlinkResults;
    logger.debug(DebugTemplates.generator.symlinkGenerationComplete(), currentManifest.symlinks?.length ?? 0);

    // Update timestamp
    currentManifest.lastGenerated = new Date().toISOString(); // Use new field name

    // Manifest writing behavior is now solely determined by the injected IFileSystem type
    try {
      logger.debug(DebugTemplates.generator.writingManifest(), manifestPath, this.fs.constructor.name);
      const manifestDir = path.dirname(manifestPath);
      await this.fs.ensureDir(manifestDir);
      await this.fs.writeFile(manifestPath, JSON.stringify(currentManifest, null, 2));
      logger.debug(DebugTemplates.generator.manifestWritten());
    } catch (error) {
      logger.debug(DebugTemplates.generator.manifestWriteFailed(), manifestPath, error instanceof Error ? error.message : String(error));
      // Potentially re-throw or handle more gracefully depending on requirements
    }

    logger.debug(DebugTemplates.generator.orchestrationComplete(), this.fs.constructor.name);
    return currentManifest;
  }
}
