import path from 'node:path';
import type { IResolvedFileSystem } from '@dotfiles/file-system';
import type { IReplaceInFileOptions, ReplaceInFilePattern, ReplaceInFileReplacer } from '@dotfiles/utils';
import { replaceInFile } from '@dotfiles/utils';
import type { IToolConfigContext } from '../builder';
import type { BoundReplaceInFile, ISystemInfo } from '../common';
import type { ProjectConfig } from '../config';

export function createToolConfigContext(
  projectConfig: ProjectConfig,
  systemInfo: ISystemInfo,
  toolName: string,
  toolDir: string,
  fileSystem: IResolvedFileSystem
): IToolConfigContext {
  const currentDir = path.join(projectConfig.paths.binariesDir, toolName, 'current');

  const normalizedSystemInfo: ISystemInfo = {
    platform: systemInfo.platform,
    arch: systemInfo.arch,
    homeDir: projectConfig.paths.homeDir,
  };

  const boundReplaceInFile: BoundReplaceInFile = (
    filePath: string,
    from: ReplaceInFilePattern,
    to: ReplaceInFileReplacer,
    options?: IReplaceInFileOptions
  ): Promise<void> => replaceInFile(fileSystem, filePath, from, to, options);

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
