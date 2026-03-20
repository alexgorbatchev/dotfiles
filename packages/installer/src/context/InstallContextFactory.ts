import type { ProjectConfig } from '@dotfiles/config';
import type { IInstallContext, ISystemInfo, PluginEmittedHookEvent, Shell, ToolConfig } from '@dotfiles/core';
import { createToolConfigContext, type InstallEvent } from '@dotfiles/core';
import type { IResolvedFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import type { TrackedFileSystem } from '@dotfiles/registry/file';
import path from 'node:path';
import { createConfiguredShell } from '../utils';

type UnknownRecord = Record<string, unknown>;

type EmitEvent = (type: PluginEmittedHookEvent, data: UnknownRecord) => Promise<void>;

export interface IInstallContextWithEmitter extends IInstallContext {
  emitEvent?: EmitEvent;
}

export interface ICreateBaseInstallContextResult {
  context: IInstallContextWithEmitter;
  logger: TsLogger;
}

interface ICreateMinimalContextOptions {
  toolName: string;
  toolConfig: ToolConfig;
  parentLogger: TsLogger;
  $shell?: Shell;
}

interface ICreateBaseInstallContextOptions {
  toolName: string;
  stagingDir: string;
  timestamp: string;
  toolConfig: ToolConfig;
  parentLogger: TsLogger;
  $shell?: Shell;
  installEnv?: Record<string, string | undefined>;
}

interface IInstallContextFactoryDependencies {
  projectConfig: ProjectConfig;
  systemInfo: ISystemInfo;
  resolvedFileSystem: IResolvedFileSystem;
  fileSystem: TrackedFileSystem;
  $shell: Shell;
  emitInstallEvent: (event: InstallEvent) => Promise<void>;
}

export class InstallContextFactory {
  private readonly projectConfig: ProjectConfig;
  private readonly systemInfo: ISystemInfo;
  private readonly resolvedFileSystem: IResolvedFileSystem;
  private readonly fileSystem: TrackedFileSystem;
  private readonly $shell: Shell;
  private readonly emitInstallEvent: (event: InstallEvent) => Promise<void>;

  constructor(dependencies: IInstallContextFactoryDependencies) {
    this.projectConfig = dependencies.projectConfig;
    this.systemInfo = dependencies.systemInfo;
    this.resolvedFileSystem = dependencies.resolvedFileSystem;
    this.fileSystem = dependencies.fileSystem;
    this.$shell = dependencies.$shell;
    this.emitInstallEvent = dependencies.emitInstallEvent;
  }

  createMinimalContext(options: ICreateMinimalContextOptions): IInstallContext {
    const toolDir = this.getToolDirectory(options.toolConfig);
    const contextLogger = options.parentLogger.getSubLogger({ name: 'minimalContext' });

    const baseContext = createToolConfigContext(
      this.projectConfig,
      this.systemInfo,
      options.toolName,
      toolDir,
      this.resolvedFileSystem,
      contextLogger,
    );

    const context: IInstallContext = {
      ...baseContext,
      stagingDir: '',
      timestamp: '',
      toolConfig: options.toolConfig,
      $: options.$shell ?? createConfiguredShell(this.$shell, process.env),
      fileSystem: this.fileSystem,
    };

    return context;
  }

  createBaseInstallContext(options: ICreateBaseInstallContextOptions): ICreateBaseInstallContextResult {
    const toolDir = this.getToolDirectory(options.toolConfig);
    const contextLogger = options.parentLogger.getSubLogger({ name: `install-${options.toolName}` });

    const baseContext = createToolConfigContext(
      this.projectConfig,
      this.systemInfo,
      options.toolName,
      toolDir,
      this.resolvedFileSystem,
      contextLogger,
    );

    const shell = options.$shell ?? createConfiguredShell(this.$shell, process.env);

    const createInstallContext = (data: UnknownRecord = {}): IInstallContextWithEmitter => ({
      ...baseContext,
      stagingDir: options.stagingDir,
      timestamp: options.timestamp,
      toolConfig: options.toolConfig,
      $: shell,
      fileSystem: this.fileSystem,
      installEnv: options.installEnv,
      ...data,
    });

    const context = createInstallContext();

    const emitEvent: EmitEvent = async (type: PluginEmittedHookEvent, data: UnknownRecord): Promise<void> => {
      await this.emitInstallEvent({
        type,
        toolName: options.toolName,
        context: {
          ...createInstallContext(data),
          emitEvent,
          logger: contextLogger,
        },
      });
    };

    context.emitEvent = emitEvent;

    const result: ICreateBaseInstallContextResult = {
      context,
      logger: contextLogger,
    };

    return result;
  }

  private getToolDirectory(toolConfig: ToolConfig): string {
    return toolConfig.configFilePath ? path.dirname(toolConfig.configFilePath) : this.projectConfig.paths.toolConfigsDir;
  }
}
