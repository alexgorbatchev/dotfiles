import { NodeFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { exitCli, ExitCode, getCliBinPath } from '@dotfiles/utils';
import path from 'node:path';
import { messages } from './log-messages';
import type { ICommandCompletionMeta, IGlobalProgram, IGlobalProgramOptions, IServices } from './types';

/**
 * Completion metadata for the docs command.
 */
export const DOCS_COMMAND_COMPLETION: ICommandCompletionMeta = {
  name: 'docs',
  description: 'Create symlink to documentation',
  options: [
    {
      flag: '--target-path',
      description: 'Target directory for docs symlink',
      hasArg: true,
      argPlaceholder: '<path>',
    },
  ],
};

/**
 * Command-specific options for docs command
 */
export interface IDocsCommandSpecificOptions {
  targetPath: string;
}

/**
 * Gets the docs directory path.
 * In development, docs is at the repo root.
 * In built mode, docs is copied next to cli.js in .dist/docs.
 */
function getDocsPath(): string {
  const cliBinPath = getCliBinPath();
  // Extract just the script path (second part after "bun" or similar)
  const scriptPath = cliBinPath.split(' ').pop() ?? cliBinPath;
  const scriptDir = path.dirname(scriptPath);
  return path.join(scriptDir, 'docs');
}

async function createDocsSymlink(parentLogger: TsLogger, targetPath: string, dryRun: boolean): Promise<ExitCode> {
  const logger = parentLogger.getSubLogger({ name: 'createDocsSymlink' });

  // Use real filesystem for checking paths since docs source is always on disk
  const nodeFs = new NodeFileSystem();

  const docsSourcePath = getDocsPath();
  const symlinkPath = path.join(targetPath, 'dotfiles');

  // Verify docs source exists (always check real filesystem)
  const docsExists = await nodeFs.exists(docsSourcePath);
  if (!docsExists) {
    logger.error(messages.fsItemNotFound('Docs directory', docsSourcePath));
    return ExitCode.ERROR;
  }

  // Verify target directory exists (always check real filesystem)
  const targetExists = await nodeFs.exists(targetPath);
  if (!targetExists) {
    logger.error(messages.fsItemNotFound('Target directory', targetPath));
    return ExitCode.ERROR;
  }

  // Check if symlink already exists (always check real filesystem)
  const symlinkExists = await nodeFs.exists(symlinkPath);
  if (symlinkExists) {
    logger.warn(messages.docsSymlinkExists(symlinkPath));
    return ExitCode.SUCCESS;
  }

  if (dryRun) {
    logger.info(messages.docsSymlinkDryRun(symlinkPath, docsSourcePath));
    return ExitCode.SUCCESS;
  }

  try {
    await nodeFs.symlink(docsSourcePath, symlinkPath);
    logger.info(messages.docsSymlinkCreated(symlinkPath, docsSourcePath));
    return ExitCode.SUCCESS;
  } catch (error) {
    logger.error(messages.docsSymlinkFailed(symlinkPath), error);
    return ExitCode.ERROR;
  }
}

async function docsActionLogic(
  parentLogger: TsLogger,
  options: IDocsCommandSpecificOptions & IGlobalProgramOptions,
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'docsActionLogic' });
  const { targetPath, dryRun } = options;

  logger.debug(messages.commandActionStarted('docs'));

  const exitCode = await createDocsSymlink(logger, targetPath, dryRun);
  exitCli(exitCode);
}

export function registerDocsCommand(
  parentLogger: TsLogger,
  program: IGlobalProgram,
  _servicesFactory: () => Promise<IServices>,
): void {
  const logger = parentLogger.getSubLogger({ name: 'registerDocsCommand' });

  program
    .command('docs <path>')
    .description('Create a symlink called "dotfiles" pointing to the project docs folder')
    .action(async (targetPath: string) => {
      const combinedOptions: IDocsCommandSpecificOptions & IGlobalProgramOptions = {
        targetPath: path.resolve(targetPath),
        ...program.opts(),
      };
      await docsActionLogic(logger, combinedOptions);
    });
}
