/**
 * @file generator/src/modules/cli/cleanupCommand.ts
 * @description CLI command for cleaning up generated artifacts.
 */

import type { AppConfig } from '@modules/config';
import type { IFileSystem } from '@modules/file-system';
import type { ConsolaInstance } from 'consola';
import type { GeneratedArtifactsManifest } from '@types';
import type { Command } from 'commander';
import { createClientLogger } from '@modules/logger'; // Added
import { setupServices } from '../../cli'; // Added
import { exitCli } from '../../exitCli'; // Added

export interface CleanupCommandOptions {
  allGenerated?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export interface CleanupCommandServices {
  appConfig: AppConfig;
  fileSystem: IFileSystem;
  clientLogger: ConsolaInstance;
}

export async function cleanupActionLogic(
  options: CleanupCommandOptions,
  services: CleanupCommandServices
): Promise<void> {
  const { appConfig, fileSystem, clientLogger } = services;

  clientLogger.debug('Cleanup command action logic started with options: %o', options);

  let manifestProcessedSuccessfully = false;
  let manifestFound = false;

  try {
    if (!(await fileSystem.exists(appConfig.manifestPath))) {
      clientLogger.debug(`Manifest file not found at ${appConfig.manifestPath}.`);
      // This is not an error itself, will be handled based on --all-generated
    } else {
      const manifestContent = await fileSystem.readFile(appConfig.manifestPath, 'utf8');
      const manifest: GeneratedArtifactsManifest = JSON.parse(manifestContent);
      manifestFound = true;
      clientLogger.info(`Found manifest at ${appConfig.manifestPath}. Processing artifacts...`);

      // 1. Delete shims
      if (manifest.shims && manifest.shims.length > 0) {
        clientLogger.info('Cleaning shims...');
        for (const shimPath of manifest.shims) {
          try {
            if (await fileSystem.exists(shimPath)) {
              await fileSystem.rm(shimPath);
              clientLogger.log(`Deleted shim: ${shimPath}`);
            } else {
              clientLogger.debug(`Shim not found, skipping: ${shimPath}`);
            }
          } catch (error) {
            clientLogger.warn(`Failed to delete shim ${shimPath}: ${(error as Error).message}`);
          }
        }
      } else {
        clientLogger.debug('No shims listed in manifest to clean.');
      }

      // 2. Delete shell init file
      if (manifest.shellInit && manifest.shellInit.path) {
        clientLogger.info('Cleaning shell init file...');
        const shellInitPath = manifest.shellInit.path;
        try {
          if (await fileSystem.exists(shellInitPath)) {
            await fileSystem.rm(shellInitPath);
            clientLogger.log(`Deleted shell init file: ${shellInitPath}`);
          } else {
            clientLogger.debug(`Shell init file not found, skipping: ${shellInitPath}`);
          }
        } catch (error) {
          clientLogger.warn(`Failed to delete shell init file ${shellInitPath}: ${(error as Error).message}`);
        }
      } else {
        clientLogger.debug('No shell init file path in manifest or path is null.');
      }

      // 3. Delete symlinks
      if (manifest.symlinks && manifest.symlinks.length > 0) {
        clientLogger.info('Cleaning symlinks...');
        for (const symlink of manifest.symlinks) {
          const symlinkPath = symlink.targetPath; // Corrected from linkPath to targetPath
          try {
            // Check if it's a symlink or regular file before deleting.
            // IFileSystem.rm should handle this correctly.
            if (await fileSystem.exists(symlinkPath)) {
              await fileSystem.rm(symlinkPath); // Corrected from delete to rm
              clientLogger.log(`Deleted symlink: ${symlinkPath}`);
            } else {
              clientLogger.debug(`Symlink not found, skipping: ${symlinkPath}`);
            }
          } catch (error) {
            clientLogger.warn(`Failed to delete symlink ${symlinkPath}: ${(error as Error).message}`);
          }
        }
      } else {
        clientLogger.debug('No symlinks listed in manifest to clean.');
      }

      // 4. Delete the manifest file itself
      clientLogger.info(`Attempting to delete manifest file: ${appConfig.manifestPath}`);
      try {
        if (await fileSystem.exists(appConfig.manifestPath)) {
          await fileSystem.rm(appConfig.manifestPath); // Corrected from delete to rm
          clientLogger.log(`Successfully deleted manifest file: ${appConfig.manifestPath}`);
        } else {
          clientLogger.debug('Manifest file was already removed or not found before explicit deletion attempt.');
        }
      } catch (error) {
        clientLogger.error(`Failed to delete manifest file ${appConfig.manifestPath}: ${(error as Error).message}`);
        // This is an error, but we might still proceed with --all-generated
      }
      manifestProcessedSuccessfully = true; // Mark that we attempted to process the manifest
    }
  } catch (error) {
    // Error reading or parsing the manifest
    clientLogger.warn(`Could not read or parse manifest at ${appConfig.manifestPath}: ${(error as Error).message}`);
    clientLogger.debug('Manifest read/parse error details: %O', error);
    // manifestFound remains false or becomes false if parsing failed after read
  }

  // Handle case where manifest was not found and --all-generated is false
  if (!manifestFound && !options.allGenerated) {
    clientLogger.info('Manifest not found and --all-generated flag not used. Nothing to clean based on manifest.');
    // Graceful exit as per requirements
    return;
  }


  // 5. Handle --all-generated
  if (options.allGenerated) {
    clientLogger.info(`--all-generated flag is present. Deleting entire generated directory: ${appConfig.generatedDir}`);
    try {
      if (await fileSystem.exists(appConfig.generatedDir)) {
        await fileSystem.rm(appConfig.generatedDir, { recursive: true }); // Corrected from delete to rm
        clientLogger.log(`Successfully removed generated directory: ${appConfig.generatedDir}`);
      } else {
        clientLogger.info(`Generated directory ${appConfig.generatedDir} not found. Nothing to delete.`);
      }
    } catch (error) {
      clientLogger.error(`Failed to delete generated directory ${appConfig.generatedDir}: ${(error as Error).message}`);
      // Decide if this should be a process.exit(1) or just log
    }
  } else if (!manifestProcessedSuccessfully && manifestFound) {
    // This case means manifest was found, but processing it (e.g. deleting it) might have failed.
    // And --all-generated was not set.
    clientLogger.info('Manifest was found but some operations may have failed. Check logs for details.');
  }


  clientLogger.info('Cleanup command finished.');
}

export function registerCleanupCommand(program: Command) {
  program
    .command('cleanup')
    .description('Removes artifacts generated by the tool based on the manifest, and optionally the entire generated directory.')
    .option(
      '--all-generated',
      'Also recursively delete the entire generated directory specified in AppConfig (e.g., .generated/).',
      false
    )
    .option(
      '--verbose',
      'Enable detailed debug messages.',
      false
    )
    .option(
      '--quiet',
      'Suppress all informational and debug output. Errors are still displayed.',
      false
    )
    .action(async (options: CleanupCommandOptions) => {
      const clientLogger = createClientLogger(options);
      try {
        const coreServices = await setupServices(); // No specific options like dryRun needed for cleanup setup

        const servicesForLogic: CleanupCommandServices = {
          appConfig: coreServices.appConfig,
          fileSystem: coreServices.fs,
          clientLogger,
        };
        await cleanupActionLogic(options, servicesForLogic);
      } catch (error) {
        clientLogger.error('Critical error in cleanup command: %s', (error as Error).message);
        clientLogger.debug('Error details: %O', error);
        exitCli(1);
      }
    });
}