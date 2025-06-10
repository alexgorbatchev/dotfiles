import type { AppConfig } from '@modules/config';
import { loadToolConfigsFromDirectory } from '@modules/config-loader/loadToolConfigs';
import type { IFileSystem } from '@modules/file-system';
import type { IGeneratorOrchestrator } from '@modules/generator-orchestrator';
// Removed unused class import: GeneratorOrchestrator
import { createClientLogger, createLogger as createDebugLoggerInternal } from '@modules/logger';
import type { ConsolaInstance } from 'consola';
import type { Command } from 'commander';
// Removed unused type import: DirectoryJSON
// Removed unused class imports: MemFileSystem, NodeFileSystem
// Removed unused class import: ShellInitGenerator
// Removed unused class import: ShimGenerator
// Removed unused class import: SymlinkGenerator
// Removed unused module import: path
import type { ToolConfig } from '@types';
import { exitCli } from '@exitCli';
import { setupServices } from '../../cli';

const commandInternalLog = createDebugLoggerInternal('generateCommand');

export interface GenerateCommandServices {
  appConfig: AppConfig;
  fileSystem: IFileSystem;
  generatorOrchestrator: IGeneratorOrchestrator;
  clientLogger: ConsolaInstance;
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

  // Removed try-catch block; errors will propagate to the action handler in registerGenerateCommand

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
}

export function registerGenerateCommand(program: Command): void {
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
      const finalClientLogger = createClientLogger({
        quiet: options.quiet,
        verbose: options.verbose,
      });

      try {
        // Setup services within the action handler
        const coreServices = await setupServices({ dryRun: options.dryRun });

        const servicesForLogic: GenerateCommandServices = {
          appConfig: coreServices.appConfig,
          fileSystem: coreServices.fs, // Use fs from coreServices
          generatorOrchestrator: coreServices.generatorOrchestrator,
          clientLogger: finalClientLogger,
        };

        await generateActionLogic(options, servicesForLogic);
      } catch (error) {
        commandInternalLog('generate command: Unhandled error in action handler: %O', error);
        finalClientLogger.error('Critical error in generate command: %s', (error as Error).message);
        finalClientLogger.debug('Error details: %O', error);
        exitCli(1);
      }
    });
}