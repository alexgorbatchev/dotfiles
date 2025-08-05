import { exitCli } from '@modules/cli/exitCli';
import { type TsLogger } from '@modules/logger';
import type { GlobalProgram, Services } from '../../cli';
import { ErrorTemplates, DebugTemplates, SuccessTemplates } from '@modules/shared/ErrorTemplates';

export interface FilesCommandOptions {
  dryRun: boolean;
  verbose: boolean;
  quiet: boolean;
  tool?: string;
  type?: string;
  status?: boolean;
  since?: string;
}

async function filesActionLogic(
  parentLogger: TsLogger,
  options: FilesCommandOptions,
  services: Services,
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'filesActionLogic' });
  const { fileRegistry, fs } = services;
  const { tool, type, status, since } = options;

  try {
    logger.debug(DebugTemplates.command.actionCalled('files', options.tool), options);

    // Build filter object based on options
    const filter: Record<string, unknown> = {};
    
    if (tool) {
      filter['toolName'] = tool;
    }
    
    if (type) {
      filter['fileType'] = type;
    }
    
    if (since) {
      const sinceDate = new Date(since);
      if (isNaN(sinceDate.getTime())) {
        logger.error(ErrorTemplates.config.invalid('date format for --since', since, 'ISO format like "2025-08-01"'));
        exitCli(1);
        return;
      }
      filter['createdAfter'] = sinceDate.getTime();
    }

    if (status) {
      // Show file states instead of operations
      const allTools = await fileRegistry.getRegisteredTools();
      logger.info(SuccessTemplates.general.checkingFileStates());
      
      for (const toolName of allTools) {
        if (tool && toolName !== tool) continue;
        
        const fileStates = await fileRegistry.getFileStatesForTool(toolName);
        
        if (fileStates.length === 0) {
          continue;
        }
        
        logger.info(SuccessTemplates.general.fileStatesForTool(toolName));
        
        for (const state of fileStates) {
          const exists = await fs.exists(state.filePath);
          const statusIcon = exists ? '✓' : '✗';
          const statusText = exists ? 'exists' : 'MISSING';
          const sizeText = state.sizeBytes ? ` (${state.sizeBytes} bytes)` : '';
          
          logger.info(SuccessTemplates.general.fileStatus(statusIcon, state.filePath, state.fileType, statusText, sizeText));
          
          if (state.targetPath) {
            const targetExists = await fs.exists(state.targetPath);
            const targetIcon = targetExists ? '→' : '✗';
            logger.info(SuccessTemplates.general.targetStatus(targetIcon, state.targetPath));
          }
        }
      }
      
      return;
    }

    // Get operations based on filter
    const operations = await fileRegistry.getOperations(filter);
    
    if (operations.length === 0) {
      logger.info(SuccessTemplates.general.noFileOperationsFound());
      return;
    }

    // Group by tool name for better organization
    const operationsByTool: Record<string, typeof operations> = {};
    
    for (const operation of operations) {
      if (!operationsByTool[operation.toolName]) {
        operationsByTool[operation.toolName] = [];
      }
      operationsByTool[operation.toolName]!.push(operation);
    }

    logger.info(SuccessTemplates.general.listingFileOperations());

    for (const [toolName, toolOperations] of Object.entries(operationsByTool)) {
      logger.info(SuccessTemplates.general.toolOperations(toolName, toolOperations.length));
      
      for (const operation of toolOperations) {
        const timestamp = new Date(operation.createdAt).toLocaleString();
        const sizeText = operation.sizeBytes ? ` (${operation.sizeBytes} bytes)` : '';
        
        logger.info(SuccessTemplates.general.operationInfo(operation.operationType.toUpperCase(), operation.filePath));
        logger.info(SuccessTemplates.general.operationDetails(operation.fileType, timestamp, sizeText));
        
        if (operation.targetPath) {
          logger.info(SuccessTemplates.general.operationTarget(operation.targetPath));
        }
        
        if (operation.metadata && Object.keys(operation.metadata).length > 0) {
          logger.info(SuccessTemplates.general.operationMetadata(JSON.stringify(operation.metadata)));
        }
      }
    }

  } catch (error) {
    logger.error(ErrorTemplates.command.executionFailed('files', 1, (error as Error).message));
    logger.debug(DebugTemplates.command.errorDetails(), error);
    exitCli(1);
  }
}

export function registerFilesCommand(
  parentLogger: TsLogger,
  program: GlobalProgram,
  servicesFactory: () => Promise<Services>,
): void {
  const logger = parentLogger.getSubLogger({ name: 'registerFilesCommand' });
  
  program
    .command('files')
    .description('Inspect tracked files in the registry')
    .option('--tool <name>', 'Show files for specific tool only')
    .option('--type <type>', 'Show files of specific type only (shim, binary, symlink, etc.)')
    .option('--status', 'Check file status (missing, broken links, etc.)')
    .option('--since <date>', 'Show files created since date (ISO format: 2025-08-01)')
    .action(async (options) => {
      const combinedOptions: FilesCommandOptions = { ...options, ...program.opts() };

      logger.debug(DebugTemplates.command.actionCalled('files', options.tool), combinedOptions);
      const services = await servicesFactory();
      await filesActionLogic(logger, combinedOptions, services);
    });
}