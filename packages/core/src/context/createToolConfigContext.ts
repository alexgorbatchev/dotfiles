import path from 'node:path';
import type { IResolvedFileSystem } from '@dotfiles/file-system';
import type { SafeLogMessage, TsLogger } from '@dotfiles/logger';
import type { ReplaceInFilePattern, ReplaceInFileReplacer } from '@dotfiles/utils';
import { replaceInFile } from '@dotfiles/utils';
import type { IToolConfigContext } from '../builder';
import type { BoundReplaceInFile, IBoundReplaceInFileOptions, ISystemInfo, IToolLog } from '../common';
import type { ProjectConfig } from '../config';
import { messages } from '../log-messages';

/**
 * Creates a user-facing logger wrapper that accepts plain strings.
 *
 * Wraps the internal SafeLogger to provide a simplified API for tool configurations.
 * The wrapper converts plain strings to SafeLogMessage format and uses toolName as context.
 *
 * @param logger - The parent logger instance
 * @param toolName - The tool name to use as context prefix
 * @returns An IToolLog instance for user-facing logging
 */
export function createToolLog(logger: TsLogger, toolName: string): IToolLog {
  const toolLogger = logger.getSubLogger({ context: toolName });

  const toolLog: IToolLog = {
    trace: (message: string): void => {
      toolLogger.trace(message as SafeLogMessage);
    },
    debug: (message: string): void => {
      toolLogger.debug(message as SafeLogMessage);
    },
    info: (message: string): void => {
      toolLogger.info(message as SafeLogMessage);
    },
    warn: (message: string): void => {
      toolLogger.warn(message as SafeLogMessage);
    },
    error: (message: string, error?: unknown): void => {
      if (error !== undefined) {
        toolLogger.error(message as SafeLogMessage, error);
      } else {
        toolLogger.error(message as SafeLogMessage);
      }
    },
  };

  return toolLog;
}

export function createToolConfigContext(
  projectConfig: ProjectConfig,
  systemInfo: ISystemInfo,
  toolName: string,
  toolDir: string,
  fileSystem: IResolvedFileSystem,
  logger: TsLogger
): IToolConfigContext {
  const currentDir = path.join(projectConfig.paths.binariesDir, toolName, 'current');

  const normalizedSystemInfo: ISystemInfo = {
    platform: systemInfo.platform,
    arch: systemInfo.arch,
    homeDir: projectConfig.paths.homeDir,
  };

  const boundReplaceInFile: BoundReplaceInFile = async (
    filePath: string,
    from: ReplaceInFilePattern,
    to: ReplaceInFileReplacer,
    options?: IBoundReplaceInFileOptions
  ): Promise<boolean> => {
    const wasReplaced = await replaceInFile(fileSystem, filePath, from, to, options);

    if (!wasReplaced && options?.errorMessage) {
      const patternString = from instanceof RegExp ? from.source : from;
      logger.error(messages.replaceInFileNoMatch(patternString, filePath));
    }

    return wasReplaced;
  };

  const toolLog = createToolLog(logger, toolName);

  const context: IToolConfigContext = {
    toolName,
    toolDir,
    currentDir,
    projectConfig,
    systemInfo: normalizedSystemInfo,
    replaceInFile: boundReplaceInFile,
    log: toolLog,
  };

  return context;
}
