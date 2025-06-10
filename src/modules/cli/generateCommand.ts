import type { AppConfig } from '@modules/config';
import { loadToolConfigsFromDirectory } from '@modules/config-loader/loadToolConfigs'; // Added
import type { IFileSystem } from '@modules/file-system';
import type { IGeneratorOrchestrator } from '@modules/generator-orchestrator';
import { GeneratorOrchestrator } from '@modules/generator-orchestrator'; // Added class import
import { createClientLogger, createLogger as createDebugLoggerInternal } from '@modules/logger'; // Added createClientLogger
import type { ConsolaInstance } from 'consola';
import type { Command } from 'commander';
import type { DirectoryJSON } from '@modules/file-system'; // Added
import { MemFileSystem, NodeFileSystem } from '@modules/file-system'; // Added
import { ShellInitGenerator } from '@modules/generator-shell-init/ShellInitGenerator'; // Added
import { ShimGenerator } from '@modules/generator-shim/ShimGenerator'; // Added
import { SymlinkGenerator } from '@modules/generator-symlink/SymlinkGenerator'; // Added
import * as path from 'node:path'; // Added
import type { ToolConfig } from '@types'; // Import ToolConfig
// import type { IToolConfigLoader } from '../config-loader/types'; // Import from central location
import { exitCli } from '@exitCli';

// Local definition of IToolConfigLoader removed

const commandInternalLog = createDebugLoggerInternal('generateCommand');

export interface GenerateCommandServices {
  appConfig: AppConfig;
  fileSystem: IFileSystem;
  generatorOrchestrator: IGeneratorOrchestrator;
  clientLogger: ConsolaInstance;
  // toolConfigLoader: IToolConfigLoader; // Removed
}

export interface GenerateCommandOptions {
  dryRun: boolean;
  verbose: boolean;
  quiet: boolean;
}

export async function generateActionLogic(
  options: GenerateCommandOptions,
  services: GenerateCommandServices
): Promise<void> {
  const { appConfig, fileSystem, generatorOrchestrator, clientLogger: logger } = services; // Removed toolConfigLoader

  commandInternalLog('generateActionLogic: Called with options: %o', options);
  logger.debug('Generate command logic started with options: %o', options);

  try {
    commandInternalLog(
      'generateActionLogic: Loading tool configs from directory: %s using FS: %s',
      appConfig.toolConfigsDir,
      fileSystem.constructor.name
    );
    const toolConfigs = await loadToolConfigsFromDirectory(appConfig.toolConfigsDir, fileSystem);
    commandInternalLog('generateActionLogic: Loaded %d tool configs.', Object.keys(toolConfigs).length);
    logger.debug('Loaded tool configs: %o', Object.keys(toolConfigs));

    commandInternalLog(
      'generateActionLogic: Calling generatorOrchestrator.generateAll. Dry run is %s, FileSystem is %s',
      options.dryRun,
      fileSystem.constructor.name
    );
    logger.debug(
      'Calling generatorOrchestrator.generateAll. Dry run: %s, FS: %s',
      options.dryRun,
      fileSystem.constructor.name
    );

    const manifest = await generatorOrchestrator.generateAll(toolConfigs, {
      // generatorVersion can be added here if needed from package.json
    });
    commandInternalLog('generateActionLogic: Artifacts generated successfully. Manifest: %o', manifest);
    logger.debug('Raw generated manifest: %o', manifest);

    logger.info('Artifact generation complete.');

    const numShims = manifest.shims?.length ?? 0;
    logger.info(`Generated ${numShims} shims in ${appConfig.targetDir}`);
    if (numShims > 0) {
      logger.info('Generated shims by tool:');
      Object.values(toolConfigs).forEach((toolConfigValue) => {
        const toolConfig = toolConfigValue as ToolConfig; // Type assertion
        if (toolConfig.binaries && toolConfig.binaries.length > 0) {
          if (toolConfig.binaries.length === 1 && toolConfig.binaries[0] === toolConfig.name) {
            logger.info(`  - ${toolConfig.name}`);
          } else {
            logger.info(`  - ${toolConfig.name} -> ${toolConfig.binaries.join(', ')}`);
          }
        }
      });
    }

    if (options.verbose && manifest.shims && numShims > 0) {
      logger.debug('Individual shim paths:');
      manifest.shims.forEach((shimPath) => logger.debug(`    - ${shimPath}`));
    }

    if (manifest.shellInit?.path) {
      logger.info(`Shell init file generated at: ${manifest.shellInit.path}`);
      if (options.verbose) {
        logger.debug(`Shell init file confirmed at: ${manifest.shellInit.path}`);
      }
    } else {
      logger.info('No shell init file generated.');
    }

    const numSymlinks = manifest.symlinks?.length ?? 0;
    logger.info(`Processed ${numSymlinks} symlink operations.`);
    if (options.verbose && manifest.symlinks && numSymlinks > 0) {
      logger.debug('Details of symlink operations:');
      manifest.symlinks.forEach((op) => {
        let symlinkMessage = `  - Target: ${op.targetPath} <- Source: ${op.sourcePath} (Status: ${op.status})`;
        if (op.status === 'failed' && op.error) {
          symlinkMessage += ` | Error: ${op.error}`;
        } else if (op.status === 'skipped_exists') {
          symlinkMessage += ` (target already exists)`;
        } else if (op.status === 'skipped_source_missing') {
          symlinkMessage += ` (source file missing)`;
        }
        logger.debug(symlinkMessage);
      });
    }

    if (options.dryRun) {
      logger.info('Dry run complete. No changes were made.');
    }
  } catch (error) {
    commandInternalLog('generateActionLogic: Error during artifact generation: %O', error);
    logger.error('Error during artifact generation: %s', (error as Error).message);
    logger.debug('Error details: %O', error);
    exitCli(1);
  }
}

export function registerGenerateCommand(program: Command, services: GenerateCommandServices): void {
  program
    .command('generate')
    .description('Generates shims, shell init files, and symlinks based on tool configurations.')
    .option(
      '--dry-run',
      'Simulate generation without writing to disk. Tool configs will be read from disk and loaded into memory.',
      false,
    )
    .option('--verbose', 'Show verbose output', false)
    .option('--quiet', 'Suppress all output', false)
    .action(async (options: GenerateCommandOptions) => {
      // Use appConfig from the initial services.
      const appConfig = services.appConfig;

      const finalClientLogger = createClientLogger({
        quiet: options.quiet,
        verbose: options.verbose,
      });

      let finalFileSystem: IFileSystem;
      // Determine the correct FileSystem based on options.dryRun
      if (options.dryRun) {
        commandInternalLog('Action: Dry run enabled. Initializing MemFileSystem.');
        const tempNodeFsForReadingConfigs = new NodeFileSystem();
        const toolFilesJson: DirectoryJSON = {};
        const realToolConfigsDir = appConfig.toolConfigsDir;

        try {
          if (await tempNodeFsForReadingConfigs.exists(realToolConfigsDir)) {
            commandInternalLog('Action: Reading tool configs from actual directory for MemFS: %s', realToolConfigsDir);
            const filesInDir = await tempNodeFsForReadingConfigs.readdir(realToolConfigsDir);
            for (const fileName of filesInDir) {
              if (fileName.endsWith('.tool.ts')) {
                const filePath = path.join(realToolConfigsDir, fileName);
                try {
                  const content = await tempNodeFsForReadingConfigs.readFile(filePath, 'utf8');
                  toolFilesJson[filePath] = content;
                  commandInternalLog('Action: Added tool config %s to MemFileSystem.', filePath);
                } catch (readError) {
                  commandInternalLog('Action: Error reading tool file %s for dry run MemFS: %O', filePath, readError);
                }
              }
            }
          } else {
            commandInternalLog('Action: Tool configs directory %s does not exist for MemFS pre-population.', realToolConfigsDir);
          }
        } catch (dirError) {
          commandInternalLog('Action: Error accessing tool configs directory %s for dry run MemFS: %O', realToolConfigsDir, dirError);
        }
        finalFileSystem = new MemFileSystem(toolFilesJson);
      } else {
        commandInternalLog('Action: Dry run disabled. Initializing NodeFileSystem.');
        finalFileSystem = new NodeFileSystem();
      }
      commandInternalLog('Action: Using IFileSystem implementation: %s', finalFileSystem.constructor.name);

      // Re-instantiate generators and orchestrator with the chosen fileSystem and appConfig
      const shimGenerator = new ShimGenerator(finalFileSystem, appConfig);
      const shellInitGenerator = new ShellInitGenerator(finalFileSystem, appConfig);
      const symlinkGenerator = new SymlinkGenerator(finalFileSystem, appConfig);
      const finalGeneratorOrchestrator = new GeneratorOrchestrator(
        shimGenerator,
        shellInitGenerator,
        symlinkGenerator,
        finalFileSystem,
        appConfig
      );

      const servicesForLogic: GenerateCommandServices = {
        appConfig,
        fileSystem: finalFileSystem,
        generatorOrchestrator: finalGeneratorOrchestrator,
        clientLogger: finalClientLogger,
      };

      await generateActionLogic(options, servicesForLogic);
    });
}