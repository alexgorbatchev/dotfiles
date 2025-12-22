import path from 'node:path';
import type { IToolConfigContext } from '../builder';
import type { ISystemInfo } from '../common';
import type { ProjectConfig } from '../config';

export function createToolConfigContext(
  projectConfig: ProjectConfig,
  systemInfo: ISystemInfo,
  toolName: string,
  toolDir: string
): IToolConfigContext {
  const currentDir = path.join(projectConfig.paths.binariesDir, toolName, 'current');

  const normalizedSystemInfo: ISystemInfo = {
    platform: systemInfo.platform,
    arch: systemInfo.arch,
    homeDir: projectConfig.paths.homeDir,
  };

  const context: IToolConfigContext = {
    toolName,
    toolDir,
    currentDir,
    projectConfig,
    systemInfo: normalizedSystemInfo,
  };

  return context;
}
