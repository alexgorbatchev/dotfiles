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
    this.logger.debug('constructor: Initializing GeneratorOrchestrator.');
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
    logger.debug(
      'generateAll: Method entry. Options: %o, FileSystem: %s',
      options,
      this.fs.constructor.name
    );
    logger.debug(
      'generateAll: Initial appConfig.paths.manifestPath: %s',
      this.appConfig.paths.manifestPath
    );

    const generatorVersion = options?.generatorVersion;
    const toolConfigsCount = toolConfigs ? Object.keys(toolConfigs).length : 0;

    logger.debug(
      `generateAll: Parsed options: generatorVersion=${generatorVersion}, toolConfigsCount=${toolConfigsCount}`
    );

    if (!this.appConfig) {
      logger.debug('generateAll: CRITICAL - this.appConfig is null/undefined at method start.');
      throw new Error('GeneratorOrchestrator: AppConfig is not available.');
    }
    logger.debug(
      'generateAll: YamlConfig available. paths.manifestPath: %s',
      this.appConfig.paths.manifestPath
    );

    if (!this.appConfig.paths.manifestPath) {
      logger.debug('generateAll: CRITICAL: paths.manifestPath is undefined/null on appConfig.');
      throw new Error(
        'GeneratorOrchestrator: YamlConfig.paths.manifestPath is missing.'
      );
    }
    const manifestPath = this.appConfig.paths.manifestPath;
    logger.debug(`generateAll: Manifest path determined as: ${manifestPath}`);

    let currentManifest: GeneratedArtifactsManifest;

    logger.debug('generateAll: Proceeding with manifest read/init using %s.', this.fs.constructor.name);
    try {
      const manifestFileExists = await this.fs.exists(manifestPath);
      logger.debug(`generateAll: fs.exists call completed. manifestFileExists = ${manifestFileExists}`);

      if (manifestFileExists) {
        logger.debug(`generateAll: Existing manifest found at ${manifestPath}. Reading...`);
        const fileContent = await this.fs.readFile(manifestPath);
        logger.debug('generateAll: readFile call completed.');
        currentManifest = JSON.parse(fileContent) as GeneratedArtifactsManifest;
        logger.debug('generateAll: Existing manifest read and parsed successfully.');
      } else {
        logger.debug(`generateAll: No existing manifest found at ${manifestPath}. Creating a new one.`);
        currentManifest = {
          lastGenerated: '', // Will be updated
          shims: [],
          symlinks: [],
          // shellInit will be populated by sub-generator
        };
      }
    } catch (error) {
      logger.debug(
        `generateAll: Error reading or parsing existing manifest at ${manifestPath}. Defaulting to a new manifest. Error: ${error instanceof Error ? error.message : String(error)}`
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
    logger.debug('generateAll: Calling shimGenerator.generate with options: %o', shimOptions);
    const generatedShimsPaths = await this.shimGenerator.generate(toolConfigs, shimOptions);
    currentManifest.shims = generatedShimsPaths;
    logger.debug(
      `generateAll: Shim generation complete. ${currentManifest.shims?.length ?? 0} shims recorded.`
    );

    // 2. Generate Shell Init
    // dryRun is removed; IFileSystem handles behavior
    const shellInitOptions: GenerateShellInitOptions = {}; // Add other options if any in future
    logger.debug('generateAll: Calling shellInitGenerator.generate with options: %o', shellInitOptions);
    const generatedShellInitPath = await this.shellInitGenerator.generate(
      toolConfigs,
      shellInitOptions
    );
    currentManifest.shellInit = { path: generatedShellInitPath };
    logger.debug(
      `generateAll: Shell init generation complete. Recorded path: ${currentManifest.shellInit?.path ?? 'null'}`
    );

    // 3. Generate Symlinks
    // dryRun is removed; IFileSystem handles behavior
    const symlinkOptions: GenerateSymlinksOptions = { overwrite: true, backup: true };
    logger.debug('generateAll: Calling symlinkGenerator.generate with options: %o', symlinkOptions);
    const symlinkResults: SymlinkOperationResult[] = await this.symlinkGenerator.generate(
      toolConfigs,
      symlinkOptions
    );
    currentManifest.symlinks = symlinkResults;
    logger.debug(
      `generateAll: Symlink generation complete. ${currentManifest.symlinks?.length ?? 0} symlink operations recorded.`
    );

    // Update timestamp
    currentManifest.lastGenerated = new Date().toISOString(); // Use new field name

    // Manifest writing behavior is now solely determined by the injected IFileSystem type
    try {
      logger.debug(
        'generateAll: Writing updated manifest to %s using %s',
        manifestPath,
        this.fs.constructor.name
      );
      const manifestDir = path.dirname(manifestPath);
      await this.fs.ensureDir(manifestDir);
      await this.fs.writeFile(manifestPath, JSON.stringify(currentManifest, null, 2));
      logger.debug('generateAll: Manifest written successfully.');
    } catch (error) {
      logger.debug(
        `generateAll: Failed to write manifest to ${manifestPath}. Error: ${error instanceof Error ? error.message : String(error)}`
      );
      // Potentially re-throw or handle more gracefully depending on requirements
    }

    logger.debug('generateAll: Orchestration complete using %s.', this.fs.constructor.name);
    return currentManifest;
  }
}
