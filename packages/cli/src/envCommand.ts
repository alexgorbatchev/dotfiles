import { NodeFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { exitCli } from '@dotfiles/utils';
import {
  CONFIG_FILE_NAME,
  DEFAULT_ENV_NAME,
  VirtualEnvManager,
} from '@dotfiles/virtual-env';
import path from 'node:path';
import * as readline from 'node:readline';
import { messages } from './log-messages';
import type { ICommandCompletionMeta, IGlobalProgram, IGlobalProgramOptions } from './types';

/**
 * Completion metadata for the env command.
 */
export const ENV_COMMAND_COMPLETION: ICommandCompletionMeta = {
  name: 'env',
  description: 'Manage virtual environments',
  subcommands: [
    {
      name: 'create',
      description: 'Create a new virtual environment',
      hasPositionalArg: true,
      positionalArgDescription: 'environment name (default: env)',
    },
    {
      name: 'delete',
      description: 'Delete a virtual environment',
      hasPositionalArg: true,
      positionalArgDescription: 'environment name (default: env)',
      options: [
        { flag: '--force', description: 'Skip confirmation prompt' },
      ],
    },
  ],
};

/**
 * Options for the env create command.
 */
export interface IEnvCreateOptions {
  // No command-specific options currently
}

/**
 * Options for the env delete command.
 */
export interface IEnvDeleteOptions {
  force?: boolean;
}

/**
 * Prompts the user for confirmation.
 */
async function confirmDeletion(envDir: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`Delete environment at '${envDir}'? [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function createActionLogic(
  logger: TsLogger,
  envName: string,
  _options: IEnvCreateOptions & IGlobalProgramOptions,
): Promise<void> {
  const fs = new NodeFileSystem();
  const manager = new VirtualEnvManager(logger, fs);
  const cwd = process.cwd();

  const result = await manager.create({
    name: envName,
    parentDir: cwd,
    force: false,
  });

  if (!result.success) {
    logger.error(messages.envOperationFailed('create', result.error));
    exitCli(1);
    return;
  }

  const configPath = path.join(result.envDir, CONFIG_FILE_NAME);
  logger.info(messages.envCreated(result.envDir));
  logger.info(messages.envActivationHint(envName));
  logger.info(messages.envConfigPath(configPath));
}

async function deleteActionLogic(
  logger: TsLogger,
  envName: string,
  options: IEnvDeleteOptions & IGlobalProgramOptions,
): Promise<void> {
  const fs = new NodeFileSystem();
  const manager = new VirtualEnvManager(logger, fs);
  const cwd = process.cwd();
  const envDir = path.resolve(cwd, envName);

  // Check if environment exists
  if (!(await manager.isValidEnv(envDir))) {
    logger.error(messages.envNotFound(envDir));
    exitCli(1);
    return;
  }

  // Ask for confirmation unless --force is provided
  if (!options.force) {
    const confirmed = await confirmDeletion(envDir);
    if (!confirmed) {
      logger.info(messages.envDeletionCancelled());
      return;
    }
  }

  const result = await manager.delete(envDir);

  if (!result.success) {
    logger.error(messages.envOperationFailed('delete', result.error));
    exitCli(1);
    return;
  }

  logger.info(messages.envDeleted(result.envDir));
}

export function registerEnvCommand(
  parentLogger: TsLogger,
  program: IGlobalProgram,
): void {
  const logger = parentLogger.getSubLogger({ name: 'registerEnvCommand' });

  const envCmd = program
    .command('env')
    .description('Manage virtual environments for isolated dotfiles configurations.');

  // Create subcommand
  envCmd
    .command('create [name]')
    .description('Create a new virtual environment')
    .action(async (name?: string) => {
      const envName = name ?? DEFAULT_ENV_NAME;
      const combinedOptions: IEnvCreateOptions & IGlobalProgramOptions = program.opts();
      await createActionLogic(logger, envName, combinedOptions);
    });

  // Delete subcommand
  envCmd
    .command('delete [name]')
    .description('Delete a virtual environment')
    .option('--force', 'Skip confirmation prompt', false)
    .action(async (name: string | undefined, options: IEnvDeleteOptions) => {
      const envName = name ?? DEFAULT_ENV_NAME;
      const combinedOptions: IEnvDeleteOptions & IGlobalProgramOptions = { ...options, ...program.opts() };
      await deleteActionLogic(logger, envName, combinedOptions);
    });
}
