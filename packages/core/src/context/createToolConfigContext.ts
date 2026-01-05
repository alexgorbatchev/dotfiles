import path from 'node:path';
import type { IResolvedFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import type { ReplaceInFilePattern, ReplaceInFileReplacer } from '@dotfiles/utils';
import { replaceInFile } from '@dotfiles/utils';
import type { IToolConfigContext } from '../builder';
import type { BoundReplaceInFile, IBoundReplaceInFileOptions, ISystemInfo } from '../common';
import type { ProjectConfig } from '../config';
import { messages } from '../log-messages';

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

  const context: IToolConfigContext = {
    toolName,
    toolDir,
    currentDir,
    projectConfig,
    systemInfo: normalizedSystemInfo,
    replaceInFile: boundReplaceInFile,
  };

  return context;
}
