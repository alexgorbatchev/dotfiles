import type { GlobalProgram, Services } from './types';
import { contractHomePath, ExitCode, exitCli, formatPermissions } from '@dotfiles/utils';
import { cliLogMessages } from './log-messages';
import type { YamlConfig } from '@dotfiles/config';
import type { FileOperation, IFileRegistry } from '@dotfiles/registry/file';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';

export interface FilesCommandOptions {
  dryRun: boolean;
  verbose: boolean;
  quiet: boolean;
  tool?: string;
  type?: string;
  status?: boolean;
  since?: string;
}

function buildOperationsFilter(
  options: FilesCommandOptions,
  logger: TsLogger
): { filter: Record<string, unknown>; exitCode: ExitCode } {
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
      logger.error(
        cliLogMessages.configParameterInvalid('date format for --since', since, 'ISO format like "2025-08-01"')
      );
      return { filter: {}, exitCode: ExitCode.ERROR };
    }
    filter['createdAfter'] = sinceDate.getTime();
  }

  return { filter, exitCode: ExitCode.SUCCESS };
}

async function showFileStates(
  logger: TsLogger,
  fileRegistry: IFileRegistry,
  fs: IFileSystem,
  tool?: string
): Promise<void> {
  const allTools = await fileRegistry.getRegisteredTools();
  logger.info(cliLogMessages.filesCheckingFileStates());

  for (const toolName of allTools) {
    if (tool && toolName !== tool) continue;

    const fileStates = await fileRegistry.getFileStatesForTool(toolName);
    if (fileStates.length === 0) continue;

    logger.info(cliLogMessages.filesFileStatesForTool(toolName));

    for (const state of fileStates) {
      await logFileState(logger, fs, state);
    }
  }
}

async function logFileState(
  logger: TsLogger,
  fs: IFileSystem,
  state: { filePath: string; fileType: string; sizeBytes?: number; targetPath?: string }
): Promise<void> {
  const exists = await fs.exists(state.filePath);
  const statusIcon = exists ? '✓' : '✗';
  const statusText = exists ? 'exists' : 'MISSING';
  const sizeText = state.sizeBytes ? ` (${state.sizeBytes} bytes)` : '';

  logger.info(cliLogMessages.filesFileStatus(statusIcon, state.filePath, state.fileType, statusText, sizeText));

  if (state.targetPath) {
    const targetExists = await fs.exists(state.targetPath);
    const targetIcon = targetExists ? '→' : '✗';
    logger.info(cliLogMessages.filesTargetStatus(targetIcon, state.targetPath));
  }
}

function buildMetadataString(
  operation: { sizeBytes?: number; permissions?: number; targetPath?: string; metadata?: Record<string, unknown> },
  yamlConfig: YamlConfig
): string {
  const metadataParts: string[] = [];

  if (operation.sizeBytes) {
    metadataParts.push(`size: ${operation.sizeBytes}`);
  }

  if (operation.permissions) {
    metadataParts.push(`permissions: ${formatPermissions(operation.permissions)}`);
  }

  if (operation.targetPath) {
    metadataParts.push(`target: ${contractHomePath(yamlConfig.paths.homeDir, operation.targetPath)}`);
  }

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
  logger: TsLogger,
  operation: FileOperation,
  timestamp: string,
  contractedPath: string,
  metadataString: string,
  yamlConfig: YamlConfig
): void {
  switch (operation.operationType) {
    case 'writeFile': {
      const writeMessage = `[${operation.toolName}] write ${contractedPath}`;
      logger.info(cliLogMessages.filesOperationHistory(timestamp, writeMessage, metadataString));
      break;
    }
    case 'mkdir': {
      const mkdirMessage = `[${operation.toolName}] mkdir ${contractedPath}`;
      logger.info(cliLogMessages.filesOperationHistory(timestamp, mkdirMessage, metadataString));
      break;
    }
    case 'chmod': {
      const modeString = formatPermissions(operation.permissions || 0);
      const chmodMessage = `[${operation.toolName}] chmod ${modeString} ${contractedPath}`;
      logger.info(cliLogMessages.filesOperationHistory(timestamp, chmodMessage, metadataString));
      break;
    }
    case 'rm': {
      const removeMessage = `[${operation.toolName}] rm ${contractedPath}`;
      logger.info(cliLogMessages.filesOperationHistory(timestamp, removeMessage, metadataString));
      break;
    }
    case 'rename': {
      const targetPath = operation.targetPath
        ? contractHomePath(yamlConfig.paths.homeDir, operation.targetPath)
        : contractedPath;
      const renameMessage = `[${operation.toolName}] mv ${targetPath} ${contractedPath}`;
      logger.info(cliLogMessages.filesOperationHistory(timestamp, renameMessage, metadataString));
      break;
    }
    case 'cp': {
      const sourcePath = operation.targetPath
        ? contractHomePath(yamlConfig.paths.homeDir, operation.targetPath)
        : contractedPath;
      const copyMessage = `[${operation.toolName}] cp ${sourcePath} ${contractedPath}`;
      logger.info(cliLogMessages.filesOperationHistory(timestamp, copyMessage, metadataString));
      break;
    }
    case 'symlink': {
      const symlinkTargetPath = operation.targetPath
        ? contractHomePath(yamlConfig.paths.homeDir, operation.targetPath)
        : contractedPath;
      const symlinkMessage = `[${operation.toolName}] ln -s ${symlinkTargetPath} ${contractedPath}`;
      logger.info(cliLogMessages.filesOperationHistory(timestamp, symlinkMessage, metadataString));
      break;
    }
    default: {
      const defaultMessage = `[${operation.toolName}] write ${contractedPath}`;
      logger.info(cliLogMessages.filesOperationHistory(timestamp, defaultMessage, metadataString));
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

async function showOperations(logger: TsLogger, operations: FileOperation[], yamlConfig: YamlConfig): Promise<void> {
  if (operations.length === 0) {
    logger.info(cliLogMessages.filesNoOperationsFound());
    return;
  }

  const operationsByTool = groupOperationsByTool(operations);

  for (const [, toolOperations] of Object.entries(operationsByTool)) {
    for (const operation of toolOperations) {
      const timestamp = formatTimestamp(operation.createdAt);
      const metadataString = buildMetadataString(operation, yamlConfig);
      const contractedPath = contractHomePath(yamlConfig.paths.homeDir, operation.filePath);

      logOperationByType(logger, operation, timestamp, contractedPath, metadataString, yamlConfig);
    }
  }
}

async function filesActionLogic(
  parentLogger: TsLogger,
  options: FilesCommandOptions,
  services: Services
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'filesActionLogic' });
  const { fileRegistry, fs, yamlConfig } = services;

  try {
    logger.debug(cliLogMessages.commandActionCalled('files', options.tool), options);

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
    logger.error(cliLogMessages.commandExecutionFailed('files', ExitCode.ERROR, (error as Error).message));
    logger.debug(cliLogMessages.commandErrorDetails(), error);
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
    // biome-ignore lint/suspicious/noExplicitAny: Commander action callback types are not properly typed
    .action(async (_options: any) => {
      const combinedOptions: FilesCommandOptions = { ..._options, ...program.opts() } as FilesCommandOptions;

      logger.debug(cliLogMessages.commandActionCalled('files', _options.tool), combinedOptions);
      const services = await servicesFactory();
      await filesActionLogic(logger, combinedOptions, services);
    });
}
