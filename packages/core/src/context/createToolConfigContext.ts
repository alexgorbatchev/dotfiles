import type { IResolvedFileSystem } from '@dotfiles/file-system';
import type { SafeLogMessage, TsLogger } from '@dotfiles/logger';
import type { ReplaceInFilePattern, ReplaceInFileReplacer } from '@dotfiles/utils';
import { replaceInFile } from '@dotfiles/utils';
import { Glob } from 'bun';
import path from 'node:path';
import type { IToolConfigContext } from '../builder';
import type {
  BoundReplaceInFile,
  BoundResolve,
  IBoundReplaceInFileOptions,
  ISystemInfo,
  IToolLog,
} from '../common';
import type { ProjectConfig } from '../config';
import { messages } from '../log-messages';

/**
 * Error thrown when a resolve pattern matches zero or multiple paths.
 */
export class ResolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResolveError';
  }
}

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
  logger: TsLogger,
): IToolConfigContext {
  const currentDir = path.join(projectConfig.paths.binariesDir, toolName, 'current');

  const normalizedSystemInfo: ISystemInfo = {
    platform: systemInfo.platform,
    arch: systemInfo.arch,
    homeDir: projectConfig.paths.homeDir,
    hostname: systemInfo.hostname,
  };

  const boundReplaceInFile: BoundReplaceInFile = async (
    filePath: string,
    from: ReplaceInFilePattern,
    to: ReplaceInFileReplacer,
    options?: IBoundReplaceInFileOptions,
  ): Promise<boolean> => {
    const wasReplaced = await replaceInFile(fileSystem, filePath, from, to, options);

    if (!wasReplaced && options?.errorMessage) {
      const patternString = from instanceof RegExp ? from.source : from;
      logger.error(messages.replaceInFileNoMatch(patternString, filePath));
    }

    return wasReplaced;
  };

  const boundResolve: BoundResolve = (pattern: string): string => {
    // Determine the base directory for the glob scan
    const isAbsolute = path.isAbsolute(pattern);

    let cwd: string;
    let globPattern: string;

    if (isAbsolute) {
      // For absolute patterns, use the parent directory of the first path segment
      // that contains a glob character, or the directory containing the file
      const dirname = path.dirname(pattern);
      const basename = path.basename(pattern);

      // Check if dirname contains glob characters
      const hasGlobInDir = /[*?[\]{]/.test(dirname);

      if (hasGlobInDir) {
        // Find the first non-glob part of the path to use as cwd
        const parts = pattern.split(path.sep);
        const cwdParts: string[] = [];
        const patternParts: string[] = [];
        let foundGlob = false;

        for (const part of parts) {
          if (!foundGlob && !/[*?[\]{]/.test(part)) {
            cwdParts.push(part);
          } else {
            foundGlob = true;
            patternParts.push(part);
          }
        }

        cwd = cwdParts.join(path.sep) || '/';
        globPattern = patternParts.join(path.sep);
      } else {
        // Glob is only in the basename
        cwd = dirname;
        globPattern = basename;
      }
    } else {
      cwd = toolDir;
      globPattern = pattern;
    }

    const glob = new Glob(globPattern);
    const matches: string[] = [];

    for (const match of glob.scanSync({ cwd, onlyFiles: false })) {
      matches.push(path.join(cwd, match));
    }

    if (matches.length === 0) {
      logger.error(messages.resolveNoMatches(pattern));
      throw new ResolveError(`No matches found for pattern: ${pattern}`);
    }

    if (matches.length > 1) {
      const matchList = matches.slice(0, 5).join(', ') + (matches.length > 5 ? ', ...' : '');
      logger.error(messages.resolveMultipleMatches(pattern, matches.length, matchList));
      throw new ResolveError(`Pattern '${pattern}' matched ${matches.length} paths (expected exactly 1)`);
    }

    const firstMatch = matches[0];
    if (firstMatch === undefined) {
      logger.error(messages.resolveNoMatches(pattern));
      throw new ResolveError(`No matches found for pattern: ${pattern}`);
    }

    return firstMatch;
  };

  const toolLog = createToolLog(logger, toolName);

  const context: IToolConfigContext = {
    toolName,
    toolDir,
    currentDir,
    projectConfig,
    systemInfo: normalizedSystemInfo,
    replaceInFile: boundReplaceInFile,
    resolve: boundResolve,
    log: toolLog,
  };

  return context;
}
