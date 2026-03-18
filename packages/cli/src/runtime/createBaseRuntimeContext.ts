import { loadConfig, type ProjectConfig } from '@dotfiles/config';
import { architectureFromNodeJS, platformFromNodeJS, type ISystemInfo } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import { FileRegistry } from '@dotfiles/registry/file';
import { RegistryDatabase } from '@dotfiles/registry-database';
import { ToolInstallationRegistry } from '@dotfiles/registry/tool';
import type { TsLogger } from '@dotfiles/logger';
import os from 'node:os';
import path from 'node:path';
import { messages } from '../log-messages';
import { resolveConfigPath } from '../resolveConfigPath';

export interface IBaseRuntimeOptions {
  config: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  platform?: string;
  arch?: string;
  fileSystem: IFileSystem;
  configFileSystem?: IFileSystem;
  warnOnPlatformArchOverride?: boolean;
}

export interface IBaseRuntimeContext {
  projectConfig: ProjectConfig;
  systemInfo: ISystemInfo;
  registryPath: string;
  registryDatabase: RegistryDatabase;
  fileRegistry: FileRegistry;
  toolInstallationRegistry: ToolInstallationRegistry;
}

function createSystemInfo(parentLogger: TsLogger, options: IBaseRuntimeOptions): ISystemInfo {
  const platformString: NodeJS.Platform = (options.platform as NodeJS.Platform) || process.platform;
  const archString: NodeJS.Architecture = (options.arch as NodeJS.Architecture) || process.arch;

  if (options.warnOnPlatformArchOverride) {
    if (options.platform) {
      parentLogger.warn(messages.configParameterOverridden('platform', options.platform));
    }
    if (options.arch) {
      parentLogger.warn(messages.configParameterOverridden('arch', options.arch));
    }
  }

  return {
    platform: platformFromNodeJS(platformString),
    arch: architectureFromNodeJS(archString),
    homeDir: os.homedir(),
    hostname: os.hostname(),
  };
}

export async function createBaseRuntimeContext(
  parentLogger: TsLogger,
  options: IBaseRuntimeOptions,
): Promise<IBaseRuntimeContext | null> {
  const logger = parentLogger.getSubLogger({ name: 'createBaseRuntimeContext' });
  const systemInfo = createSystemInfo(parentLogger, options);

  const configPath = await resolveConfigPath(logger, options.config, {
    cwd: options.cwd,
    homeDir: systemInfo.homeDir,
  });

  if (!configPath) {
    return null;
  }

  const configFs = options.configFileSystem ?? options.fileSystem;
  const projectConfig = await loadConfig(logger, configFs, configPath, systemInfo, options.env);

  const finalSystemInfo: ISystemInfo = {
    ...systemInfo,
    homeDir: projectConfig.paths.homeDir,
  };

  const registryPath = path.join(projectConfig.paths.generatedDir, 'registry.db');
  const registryDatabase = new RegistryDatabase(parentLogger, registryPath);
  const db = registryDatabase.getConnection();
  const registryLogger = parentLogger.getSubLogger({ context: 'system' });
  const fileRegistry = new FileRegistry(registryLogger, db);
  const toolInstallationRegistry = new ToolInstallationRegistry(registryLogger, db);

  return {
    projectConfig,
    systemInfo: finalSystemInfo,
    registryPath,
    registryDatabase,
    fileRegistry,
    toolInstallationRegistry,
  };
}
