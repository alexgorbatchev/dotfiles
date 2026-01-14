import type { ProjectConfig } from '@dotfiles/config';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import type { IFileOperation, IFileRegistry } from '@dotfiles/registry/file';
import { contractHomePath, exitCli, ExitCode, formatPermissions } from '@dotfiles/utils';
import { messages } from './log-messages';
import type {
  ICommandCompletionMeta,
  IGlobalProgram,
  IGlobalProgramOptions,
  ILogCommandSpecificOptions,
  IServices,
} from './types';

/**
 * Completion metadata for the log command.
 */
export const LOG_COMMAND_COMPLETION: ICommandCompletionMeta = {
  name: 'log',
  description: 'Show file operation history',
  hasPositionalArg: true,
  positionalArgDescription: 'tool name (optional)',
  positionalArgType: 'tool',
  options: [
    { flag: '--type', description: 'Filter by file type', hasArg: true, argPlaceholder: '<type>' },
    { flag: '--status', description: 'Show current file states' },
    { flag: '--since', description: 'Show operations since date', hasArg: true, argPlaceholder: '<date>' },
  ],
};

function buildOperationsFilter(
  options: ILogCommandSpecificOptions & IGlobalProgramOptions,
  parentLogger: TsLogger,
): { filter: Record<string, unknown>; exitCode: ExitCode; } {
  const logger = parentLogger.getSubLogger({ name: 'buildOperationsFilter' });
  const { tool, type, since } = options;
  const filter: Record<string, unknown> = {};

  if (tool) {
    filter['toolName'] = tool;
  }

  if (type) {
    filter['fileType'] = type;
  }

  if (since) {
    const sinceDate = new Date(since);
    if (Number.isNaN(sinceDate.getTime())) {
      logger.error(messages.configParameterInvalid('date format for --since', since, 'ISO format like "2025-08-01"'));
      return { filter: {}, exitCode: ExitCode.ERROR };
    }
    filter['createdAfter'] = sinceDate.getTime();
  }

  return { filter, exitCode: ExitCode.SUCCESS };
}

async function showFileStates(
  parentLogger: TsLogger,
  fileRegistry: IFileRegistry,
  fs: IFileSystem,
  tool?: string,
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'showFileStates' });
  const allTools = await fileRegistry.getRegisteredTools();
  logger.info(messages.logCheckingFileStates());

  for (const toolName of allTools) {
    if (tool && toolName !== tool) continue;

    const fileStates = await fileRegistry.getFileStatesForTool(toolName);
    if (fileStates.length === 0) continue;

    logger.info(messages.logFileStatesForTool(toolName));

    for (const state of fileStates) {
      await logFileState(logger, fs, state);
    }
  }
}

async function logFileState(
  parentLogger: TsLogger,
  fs: IFileSystem,
  state: { filePath: string; fileType: string; sizeBytes?: number; targetPath?: string; },
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'logFileState' });
  const exists = await fs.exists(state.filePath);
  const statusIcon = exists ? '✓' : '✗';
  const statusText = exists ? 'exists' : 'MISSING';
  const sizeText = state.sizeBytes ? ` (${state.sizeBytes} bytes)` : '';

  logger.info(messages.logFileStatus(statusIcon, state.filePath, state.fileType, statusText, sizeText));

  if (state.targetPath) {
    const targetExists = await fs.exists(state.targetPath);
    const targetIcon = targetExists ? '→' : '✗';
    logger.info(messages.logTargetStatus(targetIcon, state.targetPath));
  }
}

function buildMetadataString(operation: {
  operationType: string;
  sizeBytes?: number;
  permissions?: number;
  targetPath?: string;
  metadata?: Record<string, unknown>;
}): string {
  const metadataParts: string[] = [];

  // Only include size for write operations (not for chmod)
  if (operation.sizeBytes && operation.operationType === 'writeFile') {
    metadataParts.push(`size: ${operation.sizeBytes}`);
  }

  // Never include permissions - they're shown in chmod/write commands when relevant
  // Never include targetPath - it's shown in ln/cp/mv commands

  // Include custom metadata
  if (operation.metadata && Object.keys(operation.metadata).length > 0) {
    for (const [key, value] of Object.entries(operation.metadata)) {
      if (key === 'newMode') {
        metadataParts.push(`${key}: ${formatPermissions(value as string | number)}`);
      } else {
        metadataParts.push(`${key}: ${value}`);
      }
    }
  }

  return metadataParts.length > 0 ? `(${metadataParts.join(', ')})` : '';
}

function formatTimestamp(createdAt: number): string {
  return new Date(createdAt)
    .toLocaleString('en-US', {
      hour12: false,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    .replace(',', '');
}

function logOperationByType(
  parentLogger: TsLogger,
  operation: IFileOperation,
  timestamp: string,
  contractedPath: string,
  metadataString: string,
  projectConfig: ProjectConfig,
): void {
  const logger = parentLogger.getSubLogger({ name: 'logOperationByType' });
  switch (operation.operationType) {
    case 'writeFile': {
      const writeMessage = `[${operation.toolName}] write ${contractedPath}`;
      logger.info(messages.logOperationHistory(timestamp, writeMessage, metadataString));
      break;
    }
    case 'mkdir': {
      const mkdirMessage = `[${operation.toolName}] mkdir ${contractedPath}`;
      logger.info(messages.logOperationHistory(timestamp, mkdirMessage, metadataString));
      break;
    }
    case 'chmod': {
      const modeString = formatPermissions(operation.permissions || 0);
      const chmodMessage = `[${operation.toolName}] chmod ${modeString} ${contractedPath}`;
      logger.info(messages.logOperationHistory(timestamp, chmodMessage, metadataString));
      break;
    }
    case 'rm': {
      const removeMessage = `[${operation.toolName}] rm ${contractedPath}`;
      logger.info(messages.logOperationHistory(timestamp, removeMessage, metadataString));
      break;
    }
    case 'rename': {
      const targetPath = operation.targetPath
        ? contractHomePath(projectConfig.paths.homeDir, operation.targetPath)
        : contractedPath;
      const renameMessage = `[${operation.toolName}] mv ${targetPath} ${contractedPath}`;
      logger.info(messages.logOperationHistory(timestamp, renameMessage, metadataString));
      break;
    }
    case 'cp': {
      const sourcePath = operation.targetPath
        ? contractHomePath(projectConfig.paths.homeDir, operation.targetPath)
        : contractedPath;
      const copyMessage = `[${operation.toolName}] cp ${sourcePath} ${contractedPath}`;
      logger.info(messages.logOperationHistory(timestamp, copyMessage, metadataString));
      break;
    }
    case 'symlink': {
      const symlinkTargetPath = operation.targetPath
        ? contractHomePath(projectConfig.paths.homeDir, operation.targetPath)
        : contractedPath;
      const symlinkMessage = `[${operation.toolName}] ln -s ${symlinkTargetPath} ${contractedPath}`;
      logger.info(messages.logOperationHistory(timestamp, symlinkMessage, metadataString));
      break;
    }
    default: {
      const defaultMessage = `[${operation.toolName}] write ${contractedPath}`;
      logger.info(messages.logOperationHistory(timestamp, defaultMessage, metadataString));
    }
  }
}

function groupOperationsByTool(operations: IFileOperation[]): Record<string, IFileOperation[]> {
  const operationsByTool: Record<string, IFileOperation[]> = {};

  for (const operation of operations) {
    if (!operationsByTool[operation.toolName]) {
      operationsByTool[operation.toolName] = [];
    }
    operationsByTool[operation.toolName]?.push(operation);
  }

  return operationsByTool;
}

async function showOperations(
  parentLogger: TsLogger,
  operations: IFileOperation[],
  projectConfig: ProjectConfig,
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'showOperations' });
  if (operations.length === 0) {
    logger.info(messages.logNoOperationsFound());
    return;
  }

  const operationsByTool = groupOperationsByTool(operations);

  for (const [, toolOperations] of Object.entries(operationsByTool)) {
    for (const operation of toolOperations) {
      const timestamp = formatTimestamp(operation.createdAt);
      const metadataString = buildMetadataString(operation);
      const contractedPath = contractHomePath(projectConfig.paths.homeDir, operation.filePath);

      logOperationByType(logger, operation, timestamp, contractedPath, metadataString, projectConfig);
    }
  }
}

async function logActionLogic(
  parentLogger: TsLogger,
  options: ILogCommandSpecificOptions & IGlobalProgramOptions,
  services: IServices,
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'logActionLogic' });
  const { fileRegistry, fs, projectConfig } = services;

  try {
    if (options.status) {
      await showFileStates(logger, fileRegistry, fs, options.tool);
      return;
    }

    const filterResult = buildOperationsFilter(options, logger);
    if (filterResult.exitCode !== ExitCode.SUCCESS) {
      exitCli(filterResult.exitCode);
      return;
    }
    const operations = await fileRegistry.getOperations(filterResult.filter);
    await showOperations(logger, operations, projectConfig);
  } catch (error) {
    logger.error(messages.commandExecutionFailed('log', ExitCode.ERROR), error);
    exitCli(ExitCode.ERROR);
  }
}

export function registerLogCommand(
  parentLogger: TsLogger,
  program: IGlobalProgram,
  servicesFactory: () => Promise<IServices>,
): void {
  const logger = parentLogger.getSubLogger({ name: 'registerLogCommand' });

  program
    .command('log [tool]')
    .description('Inspect tracked files in the registry')
    .option('--type <type>', 'Show files of specific type only (shim, binary, symlink, etc.)')
    .option('--status', 'Check file status (missing, broken links, etc.)')
    .option('--since <date>', 'Show files created since date (ISO format: 2025-08-01)')
    .action(async (tool: string | undefined, commandOptions: ILogCommandSpecificOptions) => {
      const combinedOptions: ILogCommandSpecificOptions & IGlobalProgramOptions = {
        ...commandOptions,
        tool,
        ...program.opts(),
      };
      const services = await servicesFactory();
      await logActionLogic(logger, combinedOptions, services);
    });
}
