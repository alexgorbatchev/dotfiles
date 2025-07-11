import { loadToolConfigsFromDirectory } from '@modules/config-loader/loadToolConfigs';
import { createClientLogger, createLogger } from '@modules/logger';
import type { ToolConfig } from '@types';
import { type GlobalProgram, type Services } from '../../cli';
import { exitCli } from './exitCli';

const log = createLogger('generateCommand');

export interface GenerateCommandOptions {
  dryRun: boolean;
  verbose: boolean;
  quiet: boolean;
}

export function registerGenerateCommand(
  program: GlobalProgram,
  services: Services,
): void {
  program
    .command('generate')
    .description('Generates shims, shell init files, and symlinks based on tool configurations.')
    .action(async (options) => {
      const combinedOptions = { ...options, ...program.opts() };

      const clientLogger = createClientLogger({
        quiet: combinedOptions.quiet,
        verbose: combinedOptions.verbose,
      });

      log('generate command: Action called with options: %o', combinedOptions);

      const { yamlConfig, fs, generatorOrchestrator } = services;

      try {
        log(
          'Loading tool configs from directory: %s using FS: %s',
          yamlConfig.paths.toolConfigsDir,
          fs.constructor.name,
        );
        const toolConfigs = await loadToolConfigsFromDirectory(yamlConfig.paths.toolConfigsDir, fs);
        log('Loaded %d tool configs.', Object.keys(toolConfigs).length);
        clientLogger.debug('Loaded tool configs: %o', Object.keys(toolConfigs));

        log(
          'Calling generatorOrchestrator.generateAll. Dry run is %s, FileSystem is %s',
          combinedOptions.dryRun,
          fs.constructor.name,
        );
        clientLogger.debug(
          'Calling generatorOrchestrator.generateAll. Dry run: %s, FS: %s',
          combinedOptions.dryRun,
          fs.constructor.name,
        );

        const manifest = await generatorOrchestrator.generateAll(toolConfigs, {});
        log('Artifacts generated successfully. Manifest: %o', manifest);
        clientLogger.debug('Raw generated manifest: %o', manifest);

        clientLogger.info('Artifact generation complete.');

        const numShims = manifest.shims?.length ?? 0;
        clientLogger.info(`Generated ${numShims} shims in ${yamlConfig.paths.targetDir}`);
        if (numShims > 0) {
          clientLogger.info('Generated shims by tool:');
          Object.values(toolConfigs).forEach((toolConfigValue) => {
            const toolConfig = toolConfigValue as ToolConfig;
            if (toolConfig.binaries && toolConfig.binaries.length > 0) {
              if (toolConfig.binaries.length === 1 && toolConfig.binaries[0] === toolConfig.name) {
                clientLogger.info(`  - ${toolConfig.name}`);
              } else {
                clientLogger.info(`  - ${toolConfig.name} -> ${toolConfig.binaries.join(', ')}`);
              }
            }
          });
        }

        if (combinedOptions.verbose && manifest.shims && numShims > 0) {
          clientLogger.debug('Individual shim paths:');
          manifest.shims.forEach((shimPath) => clientLogger.debug(`    - ${shimPath}`));
        }

        if (manifest.shellInit?.path) {
          clientLogger.info(`Shell init file generated at: ${manifest.shellInit.path}`);
          if (combinedOptions.verbose) {
            clientLogger.debug(`Shell init file confirmed at: ${manifest.shellInit.path}`);
          }
        } else {
          clientLogger.info('No shell init file generated.');
        }

        const numSymlinks = manifest.symlinks?.length ?? 0;
        clientLogger.info(`Processed ${numSymlinks} symlink operations.`);
        if (combinedOptions.verbose && manifest.symlinks && numSymlinks > 0) {
          clientLogger.debug('Details of symlink operations:');
          manifest.symlinks.forEach((op) => {
            let symlinkMessage = `  - Target: ${op.targetPath} <- Source: ${op.sourcePath} (Status: ${op.status})`;
            if (op.status === 'failed' && op.error) {
              symlinkMessage += ` | Error: ${op.error}`;
            } else if (op.status === 'skipped_exists') {
              symlinkMessage += ` (target already exists)`;
            } else if (op.status === 'skipped_source_missing') {
              symlinkMessage += ` (source file missing)`;
            }
            clientLogger.debug(symlinkMessage);
          });
        }

        if (combinedOptions.dryRun) {
          clientLogger.info('Dry run complete. No changes were made.');
        }
      } catch (error) {
        log('generate command: Unhandled error in action handler: %O', error);
        clientLogger.error('Critical error in generate command: %s', (error as Error).message);
        clientLogger.debug('Error details: %O', error);
        exitCli(1);
      }
    });
}