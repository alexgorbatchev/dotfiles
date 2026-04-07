import type { ProjectConfig } from '@dotfiles/config';
import type { ISystemInfo } from '@dotfiles/core';
import { NodeFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import type { ToolInstallationRegistry } from '@dotfiles/registry/tool';
import { createBaseRuntimeContext } from '../runtime/createBaseRuntimeContext';

export interface ILightRuntimeOptions {
  config: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  platform?: string;
  arch?: string;
}

export interface ILightRuntimeContext {
  projectConfig: ProjectConfig;
  systemInfo: ISystemInfo;
  toolInstallationRegistry: ToolInstallationRegistry;
  close: () => void;
}

export async function createLightRuntimeContext(
  parentLogger: TsLogger,
  options: ILightRuntimeOptions,
): Promise<ILightRuntimeContext | null> {
  const fs = new NodeFileSystem();
  const baseContext = await createBaseRuntimeContext(parentLogger, {
    config: options.config,
    cwd: options.cwd,
    env: options.env,
    platform: options.platform,
    arch: options.arch,
    fileSystem: fs,
  });

  if (!baseContext) {
    return null;
  }

  return {
    projectConfig: baseContext.projectConfig,
    systemInfo: baseContext.systemInfo,
    toolInstallationRegistry: baseContext.toolInstallationRegistry,
    close: () => {
      baseContext.registryDatabase.close();
    },
  };
}
