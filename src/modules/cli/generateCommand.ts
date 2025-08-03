import { loadToolConfigsFromDirectory } from '@modules/config-loader/loadToolConfigs';
import { type TsLogger } from '@modules/logger';
import { ErrorTemplates } from '@modules/shared/ErrorTemplates';
import { type GlobalProgram, type Services } from '../../cli';
import { exitCli } from './exitCli';

export interface GenerateCommandOptions {
  dryRun: boolean;
  verbose: boolean;
  quiet: boolean;
}

export function registerGenerateCommand(
  parentLogger: TsLogger,
  program: GlobalProgram,
  servicesFactory: () => Promise<Services>,
): void {
  const logger = parentLogger.getSubLogger({ name: 'registerGenerateCommand' });
  program
    .command('generate')
      .description('Generates shims, shell init files, and symlinks based on tool configurations.')
      .action(async (options) => {
        const combinedOptions = { ...options, ...program.opts() };
        const services = await servicesFactory();
        const { yamlConfig, fs, generatorOrchestrator } = services;
  
        logger.debug('Action called with options: %o', combinedOptions);
  
        try {
          logger.debug(
            'Loading tool configs from directory: %s using FS: %s',
            yamlConfig.paths.toolConfigsDir,
            fs.constructor.name,
          );
          const toolConfigs = await loadToolConfigsFromDirectory(logger, yamlConfig.paths.toolConfigsDir, fs);
          logger.debug('Loaded %d tool configs.', Object.keys(toolConfigs).length);
  
          const manifest = await generatorOrchestrator.generateAll(toolConfigs, {});
          logger.debug('Raw generated manifest: %o', manifest);
          logger.info('Artifact generation complete.');
  
          const numShims = manifest.shims?.length ?? 0;
          logger.info(`Generated ${numShims} shims in ${yamlConfig.paths.targetDir}`);
          if (numShims > 0) {
            logger.info('Generated shims by tool:');
            Object.values(toolConfigs).forEach((toolConfig) => {
              if (toolConfig.binaries && toolConfig.binaries.length > 0) {
                if (toolConfig.binaries.length === 1 && toolConfig.binaries[0] === toolConfig.name) {
                  logger.info(`  - ${toolConfig.name}`);
                } else {
                  logger.info(`  - ${toolConfig.name} -> ${toolConfig.binaries.join(', ')}`);
                }
              }
            });
          }
  
          if (combinedOptions.verbose && manifest.shims && numShims > 0) {
            logger.debug('Individual shim paths:');
            manifest.shims.forEach((shimPath) => logger.debug(`    - ${shimPath}`));
          }
  
          if (manifest.shellInit?.path) {
            logger.info(`Shell init file generated at: ${manifest.shellInit.path}`);
            if (combinedOptions.verbose) {
              logger.debug(`Shell init file confirmed at: ${manifest.shellInit.path}`);
            }
          } else {
            logger.info('No shell init file generated.');
          }
  
          const numSymlinks = manifest.symlinks?.length ?? 0;
          logger.info(`Processed ${numSymlinks} symlink operations.`);
          if (combinedOptions.verbose && manifest.symlinks && numSymlinks > 0) {
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
  
          if (combinedOptions.dryRun) {
            logger.info('Dry run complete. No changes were made.');
          }
        } catch (error) {
          logger.error(ErrorTemplates.command.executionFailed('generate', 1, (error as Error).message));
          logger.debug('Error details: %O', error);
          exitCli(1);
        }
      });
  }