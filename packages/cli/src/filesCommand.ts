import type { YamlConfig } from '@dotfiles/config';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import type { FileOperation, IFileRegistry } from '@dotfiles/registry/file';
import { contractHomePath, ExitCode, exitCli, formatPermissions } from '@dotfiles/utils';
import { messages } from './log-messages';
import type { FilesCommandSpecificOptions, GlobalProgram, GlobalProgramOptions, Services } from './types';

function buildOperationsFilter(
  options: FilesCommandSpecificOptions & GlobalProgramOptions,
  parentLogger: TsLogger
): { filter: Record<string, unknown>; exitCode: ExitCode } {
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
  tool?: string
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'showFileStates' });
  const allTools = await fileRegistry.getRegisteredTools();
  logger.info(messages.filesCheckingFileStates());

  for (const toolName of allTools) {
    if (tool && toolName !== tool) continue;

    const fileStates = await fileRegistry.getFileStatesForTool(toolName);
    if (fileStates.length === 0) continue;

    logger.info(messages.filesFileStatesForTool(toolName));

    for (const state of fileStates) {
      await logFileState(logger, fs, state);
    }
  }
}

async function logFileState(
  parentLogger: TsLogger,
  fs: IFileSystem,
  state: { filePath: string; fileType: string; sizeBytes?: number; targetPath?: string }
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'logFileState' });
  const exists = await fs.exists(state.filePath);
  const statusIcon = exists ? '✓' : '✗';
  const statusText = exists ? 'exists' : 'MISSING';
  const sizeText = state.sizeBytes ? ` (${state.sizeBytes} bytes)` : '';

  logger.info(messages.filesFileStatus(statusIcon, state.filePath, state.fileType, statusText, sizeText));

  if (state.targetPath) {
    const targetExists = await fs.exists(state.targetPath);
    const targetIcon = targetExists ? '→' : '✗';
    logger.info(messages.filesTargetStatus(targetIcon, state.targetPath));
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
  operation: FileOperation,
  timestamp: string,
  contractedPath: string,
  metadataString: string,
  yamlConfig: YamlConfig
): void {
  const logger = parentLogger.getSubLogger({ name: 'logOperationByType' });
  switch (operation.operationType) {
    case 'writeFile': {
      const writeMessage = `[${operation.toolName}] write ${contractedPath}`;
      logger.info(messages.filesOperationHistory(timestamp, writeMessage, metadataString));
      break;
    }
    case 'mkdir': {
      const mkdirMessage = `[${operation.toolName}] mkdir ${contractedPath}`;
      logger.info(messages.filesOperationHistory(timestamp, mkdirMessage, metadataString));
      break;
    }
    case 'chmod': {
      const modeString = formatPermissions(operation.permissions || 0);
      const chmodMessage = `[${operation.toolName}] chmod ${modeString} ${contractedPath}`;
      logger.info(messages.filesOperationHistory(timestamp, chmodMessage, metadataString));
      break;
    }
    case 'rm': {
      const removeMessage = `[${operation.toolName}] rm ${contractedPath}`;
      logger.info(messages.filesOperationHistory(timestamp, removeMessage, metadataString));
      break;
    }
    case 'rename': {
      const targetPath = operation.targetPath
        ? contractHomePath(yamlConfig.paths.homeDir, operation.targetPath)
        : contractedPath;
      const renameMessage = `[${operation.toolName}] mv ${targetPath} ${contractedPath}`;
      logger.info(messages.filesOperationHistory(timestamp, renameMessage, metadataString));
      break;
    }
    case 'cp': {
      const sourcePath = operation.targetPath
        ? contractHomePath(yamlConfig.paths.homeDir, operation.targetPath)
        : contractedPath;
      const copyMessage = `[${operation.toolName}] cp ${sourcePath} ${contractedPath}`;
      logger.info(messages.filesOperationHistory(timestamp, copyMessage, metadataString));
      break;
    }
    case 'symlink': {
      const symlinkTargetPath = operation.targetPath
        ? contractHomePath(yamlConfig.paths.homeDir, operation.targetPath)
        : contractedPath;
      const symlinkMessage = `[${operation.toolName}] ln -s ${symlinkTargetPath} ${contractedPath}`;
      logger.info(messages.filesOperationHistory(timestamp, symlinkMessage, metadataString));
      break;
    }
    default: {
      const defaultMessage = `[${operation.toolName}] write ${contractedPath}`;
      logger.info(messages.filesOperationHistory(timestamp, defaultMessage, metadataString));
    }
  }
}

function groupOperationsByTool(operations: FileOperation[]): Record<string, FileOperation[]> {
  const operationsByTool: Record<string, FileOperation[]> = {};

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
  operations: FileOperation[],
  yamlConfig: YamlConfig
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'showOperations' });
  if (operations.length === 0) {
    logger.info(messages.filesNoOperationsFound());
    return;
  }

  const operationsByTool = groupOperationsByTool(operations);

  for (const [, toolOperations] of Object.entries(operationsByTool)) {
    for (const operation of toolOperations) {
      const timestamp = formatTimestamp(operation.createdAt);
      const metadataString = buildMetadataString(operation);
      const contractedPath = contractHomePath(yamlConfig.paths.homeDir, operation.filePath);

      logOperationByType(logger, operation, timestamp, contractedPath, metadataString, yamlConfig);
    }
  }
}

async function filesActionLogic(
  parentLogger: TsLogger,
  options: FilesCommandSpecificOptions & GlobalProgramOptions,
  services: Services
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'filesActionLogic' });
  const { fileRegistry, fs, yamlConfig } = services;

  try {
    logger.debug(messages.commandActionCalled('files', options.tool));

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
    await showOperations(logger, operations, yamlConfig);
  } catch (error) {
    logger.error(messages.commandExecutionFailed('files', ExitCode.ERROR), error);
    exitCli(ExitCode.ERROR);
  }
}

export function registerFilesCommand(
  parentLogger: TsLogger,
  program: GlobalProgram,
  servicesFactory: () => Promise<Services>
): void {
  const logger = parentLogger.getSubLogger({ name: 'registerFilesCommand' });

  program
    .command('files')
    .description('Inspect tracked files in the registry')
    .option('--tool <name>', 'Show files for specific tool only')
    .option('--type <type>', 'Show files of specific type only (shim, binary, symlink, etc.)')
    .option('--status', 'Check file status (missing, broken links, etc.)')
    .option('--since <date>', 'Show files created since date (ISO format: 2025-08-01)')
    .action(async (commandOptions: FilesCommandSpecificOptions) => {
      logger.debug(messages.commandActionCalled('files'));

      const combinedOptions: FilesCommandSpecificOptions & GlobalProgramOptions = { ...commandOptions, ...program.opts() };
      const services = await servicesFactory();
      await filesActionLogic(logger, combinedOptions, services);
    });
}
