import type { AppConfig } from '@modules/config';
import { loadToolConfigsFromDirectory } from '@modules/config-loader/loadToolConfigs';
import type { IFileSystem } from '@modules/file-system';
import { createClientLogger, createLogger as createDebugLoggerInternal } from '@modules/logger';
import type { ConsolaInstance } from 'consola';
import type { Command } from 'commander';
import path from 'node:path';
import type { ToolConfig } from '@types';
import { exitCli } from '@exitCli';
import { setupServices } from '../../cli'; // Assuming Services is exported from cli.ts, removed CoreServices alias

const commandInternalLog = createDebugLoggerInternal('detectConflictsCommand');

export interface DetectConflictsCommandServices {
  appConfig: AppConfig;
  fileSystem: IFileSystem;
  clientLogger: ConsolaInstance;
  loadToolConfigsFromDirectory: typeof loadToolConfigsFromDirectory;
}

export interface DetectConflictsCommandOptions {
  // Add any specific options for this command if needed
  verbose: boolean;
  quiet: boolean;
}

export interface ConflictEntry {
  type: 'shim' | 'symlink';
  path: string;
  toolName?: string; // For shims
  symlinkSource?: string; // For symlinks, the expected source
  reason: string;
}

export async function detectConflictsActionLogic(
  options: DetectConflictsCommandOptions,
  services: DetectConflictsCommandServices
): Promise<void> {
  const { appConfig, fileSystem, clientLogger: logger, loadToolConfigsFromDirectory: loadTools } = services;
  commandInternalLog('detectConflictsActionLogic: Called with options: %o', options);
  logger.debug('Detect conflicts command logic started with options: %o', options);

  const conflicts: ConflictEntry[] = [];

  try {
    commandInternalLog(
      'detectConflictsActionLogic: Loading tool configs from directory: %s using FS: %s',
      appConfig.toolConfigsDir,
      fileSystem.constructor.name
    );
    const toolConfigs = await loadTools(appConfig.toolConfigsDir, fileSystem);
    commandInternalLog('detectConflictsActionLogic: Loaded %d tool configs.', Object.keys(toolConfigs).length);
    logger.debug('Loaded tool configs: %o', Object.keys(toolConfigs));

    for (const toolName in toolConfigs) {
      const toolConfig = toolConfigs[toolName] as ToolConfig;
      logger.debug(`Checking tool: ${toolConfig.name}`);

      // Check for shim conflicts
      if (toolConfig.binaries && toolConfig.binaries.length > 0) {
        for (const binaryName of toolConfig.binaries) {
          const shimPath = path.join(appConfig.targetDir, binaryName);
          logger.debug(`Checking potential shim path: ${shimPath} for tool ${toolConfig.name}`);
          if (await fileSystem.exists(shimPath)) {
            // For now, any existence is a potential conflict.
            // Future: check if it's OUR shim.
            const conflictMessage = `Potential conflict: Shim path [${shimPath}] for tool [${toolConfig.name}] already exists.`;
            logger.warn(conflictMessage);
            conflicts.push({
              type: 'shim',
              path: shimPath,
              toolName: toolConfig.name,
              reason: 'File exists at shim path.',
            });
          }
        }
      }

      // Check for symlink conflicts
      if (toolConfig.symlinks && toolConfig.symlinks.length > 0) {
        for (const symlink of toolConfig.symlinks) {
          const targetPath = path.join(appConfig.homeDir, symlink.target);
          const expectedSourcePath = path.join(appConfig.dotfilesDir, symlink.source);
          logger.debug(`Checking potential symlink target: ${targetPath} for tool ${toolConfig.name}, expecting source ${expectedSourcePath}`);

          try {
            const stats = await fileSystem.stat(targetPath); // Use stat()
            // If stat succeeds, the path exists. Now check if it's a symlink.
            if (stats.isSymbolicLink()) {
              const actualLinkTarget = await fileSystem.readlink(targetPath);
              // Resolve paths to ensure consistent comparison
              // The actualLinkTarget read from a symlink might be relative to the symlink's directory
              const resolvedActualLinkTarget = path.resolve(path.dirname(targetPath), actualLinkTarget);
              const resolvedExpectedSourcePath = path.resolve(expectedSourcePath);

              if (resolvedActualLinkTarget !== resolvedExpectedSourcePath) {
                const conflictMessage = `Potential conflict: Symlink [${targetPath}] for tool [${toolConfig.name}] exists but points to [${actualLinkTarget}] (resolved: [${resolvedActualLinkTarget}]) instead of expected [${expectedSourcePath}] (resolved: [${resolvedExpectedSourcePath}]).`;
                logger.warn(conflictMessage);
                conflicts.push({
                  type: 'symlink',
                  path: targetPath,
                  toolName: toolConfig.name,
                  symlinkSource: expectedSourcePath,
                  reason: `Symlink exists but points to wrong target: ${actualLinkTarget} (resolved: ${resolvedActualLinkTarget}). Expected: ${expectedSourcePath} (resolved: ${resolvedExpectedSourcePath})`,
                });
              }
            } else { // It's a file or directory, not a symlink
              const conflictMessage = `Potential conflict: Path [${targetPath}] for tool [${toolConfig.name}]'s symlink target exists and is not a symlink.`;
              logger.warn(conflictMessage);
              conflicts.push({
                type: 'symlink',
                path: targetPath,
                toolName: toolConfig.name,
                symlinkSource: expectedSourcePath,
                reason: 'Path exists and is not a symlink.',
              });
            }
          } catch (error: any) {
            if (error.code === 'ENOENT') {
              // File does not exist, no conflict here.
              logger.debug(`No conflict for symlink target ${targetPath}, path does not exist.`);
            } else {
              // Log other errors but continue checking other symlinks/tools
              logger.error(`Error checking symlink target ${targetPath} for tool ${toolConfig.name}: ${error.message}`);
              // Optionally, add to a list of errors if needed, but not strictly a "conflict"
            }
          }
        } // End of for...of symlink loop
      } // End of if (toolConfig.symlinks)
    } // End of for...in toolConfigs loop

    if (conflicts.length > 0) {
      logger.error('Conflict detection finished. Found potential conflicts:');
      conflicts.forEach(conflict => {
        if (conflict.type === 'shim') {
          logger.error(`  - Shim: ${conflict.path} (for tool ${conflict.toolName}). Reason: ${conflict.reason}`);
        } else if (conflict.type === 'symlink') {
          logger.error(`  - Symlink Target: ${conflict.path} (for tool ${conflict.toolName}, expected source ${conflict.symlinkSource}). Reason: ${conflict.reason}`);
        }
      });
      // Consider exiting with a specific code if conflicts are found,
      // but for now, just logging is fine as per requirements.
      // exitCli(1); // Or a different exit code for conflicts
    } else {
      logger.info('Conflict detection finished. No potential conflicts found.');
    }

  } catch (error) {
    commandInternalLog('detectConflictsActionLogic: Unhandled error: %O', error);
    logger.error('Critical error during conflict detection: %s', (error as Error).message);
    logger.debug('Error details: %O', error);
    exitCli(1); // Exit with a general error code
  }
}

export function registerDetectConflictsCommand(program: Command): void {
  program
    .command('detect-conflicts')
    .description('Detects conflicts between generated artifacts and existing system files.')
    .option('--verbose', 'Show verbose output', false)
    .option('--quiet', 'Suppress all output', false)
    .action(async (options: DetectConflictsCommandOptions) => {
      const finalClientLogger = createClientLogger({
        quiet: options.quiet,
        verbose: options.verbose,
      });

      try {
        // Setup services within the action handler
        // For detect-conflicts, we don't want dryRun to affect fs for reading existing files.
        // It should always use the real file system to detect actual conflicts.
        const coreServices = await setupServices({ dryRun: false }); // dryRun is false

        const servicesForLogic: DetectConflictsCommandServices = {
          appConfig: coreServices.appConfig,
          fileSystem: coreServices.fs,
          clientLogger: finalClientLogger,
          loadToolConfigsFromDirectory, // Pass the actual function
        };

        await detectConflictsActionLogic(options, servicesForLogic);
      } catch (error) {
        commandInternalLog('detect-conflicts command: Unhandled error in action handler: %O', error);
        finalClientLogger.error('Critical error in detect-conflicts command: %s', (error as Error).message);
        finalClientLogger.debug('Error details: %O', error);
        exitCli(1);
      }
    });
}