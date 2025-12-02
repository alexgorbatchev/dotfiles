import path from 'node:path';
import type {
  AlwaysScript,
  IShellConfigurator,
  IToolConfigContext,
  OnceScript,
  ShellCompletionConfig,
  ShellCompletionConfigInput,
} from '@dotfiles/core';
import { always, once } from '@dotfiles/core';
import type { TsLogger } from '@dotfiles/logger';
import { messages } from './log-messages';
import type { IShellStorage, ShellTypeKey } from './types';

interface ICompletionOptions {
  source?: string;
  cmd?: string;
  name?: string;
  targetDir?: string;
}

/**
 * Implementation of the shell configurator interface.
 * Handles the accumulation of shell configuration settings for a specific shell type.
 */
export class ShellConfigurator implements IShellConfigurator {
  private readonly storage: IShellStorage;
  private readonly shellType: ShellTypeKey;
  private readonly context?: IToolConfigContext;
  private readonly logger: TsLogger;
  private readonly toolName: string;

  constructor(
    storage: IShellStorage,
    shellType: ShellTypeKey,
    context: IToolConfigContext | undefined,
    logger: TsLogger,
    toolName: string
  ) {
    this.storage = storage;
    this.shellType = shellType;
    this.context = context;
    this.logger = logger;
    this.toolName = toolName;
  }

  /** @inheritdoc */
  public environment(values: Record<string, string>): IShellConfigurator {
    this.storage.environment = {
      ...this.storage.environment,
      ...values,
    };
    return this;
  }

  /** @inheritdoc */
  public aliases(values: Record<string, string>): IShellConfigurator {
    this.storage.aliases = {
      ...this.storage.aliases,
      ...values,
    };
    return this;
  }

  /** @inheritdoc */
  public source(relativePath: string): IShellConfigurator {
    const command: string = this.createSourceCommand(relativePath);
    const script: AlwaysScript = always`${command}`;
    this.storage.scripts.push(script);
    return this;
  }

  /** @inheritdoc */
  public completions(completion: ShellCompletionConfigInput): IShellConfigurator {
    const completionConfig: ShellCompletionConfig = this.createCompletionConfig(completion);
    this.storage.completions = completionConfig;
    return this;
  }

  /** @inheritdoc */
  public once(script: OnceScript): IShellConfigurator;
  public once(script: string): IShellConfigurator;
  public once(script: OnceScript | string): IShellConfigurator {
    const normalizedScript: OnceScript = this.normalizeOnceScript(script);
    this.storage.scripts.push(normalizedScript);
    return this;
  }

  /** @inheritdoc */
  public always(script: AlwaysScript): IShellConfigurator;
  public always(script: string): IShellConfigurator;
  public always(script: AlwaysScript | string): IShellConfigurator {
    const normalizedScript: AlwaysScript = this.normalizeAlwaysScript(script);
    this.storage.scripts.push(normalizedScript);
    return this;
  }

  /**
   * Creates a completion configuration object from the input.
   * Handles both string paths and configuration objects.
   */
  private createCompletionConfig(completion: ShellCompletionConfigInput): ShellCompletionConfig {
    if (typeof completion === 'string') {
      const completionConfig: ShellCompletionConfig = this.createCompletionConfigFromSource(completion);
      return completionConfig;
    }

    const completionConfig: ShellCompletionConfig = this.createCompletionConfigFromOptions({
      source: completion.source,
      cmd: completion.cmd,
      name: completion.name,
      targetDir: completion.targetDir,
    });
    return completionConfig;
  }

  /**
   * Creates a completion configuration from a simple source path string.
   */
  private createCompletionConfigFromSource(sourcePath: string): ShellCompletionConfig {
    const normalizedSource = this.normalizeCompletionSource(sourcePath);
    const completionConfig: ShellCompletionConfig = {
      source: normalizedSource,
    };
    return completionConfig;
  }

  /**
   * Creates a completion configuration from options that can include source, cmd, or both.
   */
  private createCompletionConfigFromOptions(options: ICompletionOptions): ShellCompletionConfig {
    const completionConfig: ShellCompletionConfig = {
      ...(options.source ? { source: this.normalizeCompletionSource(options.source) } : {}),
      ...(options.cmd ? { cmd: options.cmd } : {}),
      ...(options.name ? { name: options.name } : {}),
      ...(options.targetDir ? { targetDir: options.targetDir } : {}),
    };

    if (!completionConfig.source && !completionConfig.cmd) {
      const message = messages.configurationFieldInvalid(
        'shell completion config',
        'completions',
        'either source or cmd must be provided'
      );
      this.logger.error(message);
      throw new Error(message);
    }

    return completionConfig;
  }

  /**
   * Validates and normalizes a completion source path.
   * Throws if the path is empty.
   */
  private normalizeCompletionSource(sourcePath: string): string {
    const trimmedPath = sourcePath.trim();
    if (trimmedPath.length === 0) {
      const message = messages.configurationFieldInvalid('shell completion source path', sourcePath, 'non-empty value');
      this.logger.error(message);
      throw new Error(message);
    }

    return trimmedPath;
  }

  /**
   * Creates the appropriate shell command to source a file.
   * Handles shell-specific syntax (e.g., `.` for PowerShell vs `source` for others).
   */
  private createSourceCommand(relativePath: string): string {
    const resolvedPath = this.resolvePath(relativePath);
    const quotedPath = JSON.stringify(resolvedPath);

    if (this.shellType === 'powershell') {
      return `. ${quotedPath}`;
    }

    return `source ${quotedPath}`;
  }

  /**
   * Resolves a relative path to an absolute path based on the tool context.
   * Handles path normalization for the target shell.
   */
  private resolvePath(relativePath: string): string {
    const trimmedPath = relativePath.trim();
    if (trimmedPath.length === 0) {
      const message = messages.configurationFieldInvalid('shell source path', relativePath, 'non-empty value');
      this.logger.error(message);
      throw new Error(message);
    }

    if (path.isAbsolute(trimmedPath)) {
      const normalizedPath = this.normalizePath(trimmedPath);
      return normalizedPath;
    }

    if (!this.context) {
      const message = messages.configurationFieldRequired(
        'tool context',
        `Please ensure createInstallFunction receives tool context before using shell.source() for "${this.toolName}"`
      );
      this.logger.error(message);
      throw new Error(message);
    }

    const joinedPath = path.join(this.context.toolDir, trimmedPath);
    const normalizedPath = this.normalizePath(joinedPath);
    return normalizedPath;
  }

  /**
   * Normalizes path separators for the target shell.
   * Uses backslashes for PowerShell and forward slashes for others.
   */
  private normalizePath(resolvedPath: string): string {
    if (this.shellType === 'powershell') {
      return resolvedPath.replace(/\//gu, '\\');
    }
    return resolvedPath.replace(/\\/gu, '/');
  }

  /**
   * Normalizes a script input into a OnceScript object.
   */
  private normalizeOnceScript(script: OnceScript | string): OnceScript {
    const normalizedScript: OnceScript = once`${script}`;
    return normalizedScript;
  }

  /**
   * Normalizes a script input into an AlwaysScript object.
   */
  private normalizeAlwaysScript(script: AlwaysScript | string): AlwaysScript {
    const normalizedScript: AlwaysScript = always`${script}`;
    return normalizedScript;
  }
}
