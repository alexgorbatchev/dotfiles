import type {
  IShellConfigurator,
  IToolConfigContext,
  ShellCompletionConfigInput,
} from '@dotfiles/core';
import { always, once, raw } from '@dotfiles/core';
import type { TsLogger } from '@dotfiles/logger';
import { VALID_FUNCTION_NAME_PATTERN } from '@dotfiles/shell-init-generator';
import type { Resolvable } from '@dotfiles/unwrap-value';
import { resolveToolRelativePath } from '@dotfiles/utils';
import path from 'node:path';
import { messages } from './log-messages';
import type { IShellStorage, ShellTypeKey } from './types';

/**
 * Implementation of the shell configurator interface.
 * Handles the accumulation of shell configuration settings for a specific shell type.
 */
export class ShellConfigurator implements IShellConfigurator<string> {
  private readonly storage: IShellStorage;
  private readonly shellType: ShellTypeKey;
  private readonly context?: IToolConfigContext;
  private readonly logger: TsLogger;
  private readonly toolName: string;
  private sourceFileCounter = 0;
  private sourceCounter = 0;

  constructor(
    storage: IShellStorage,
    shellType: ShellTypeKey,
    context: IToolConfigContext | undefined,
    logger: TsLogger,
    toolName: string,
  ) {
    this.storage = storage;
    this.shellType = shellType;
    this.context = context;
    this.logger = logger.getSubLogger({ name: 'ShellConfigurator' }).setPrefix(toolName);
    this.toolName = toolName;
  }

  /** @inheritdoc */
  public environment<T extends Record<string, string>>(
    values: 'PATH' extends keyof T ? ['ERROR: Use shell.path() to modify PATH'] : T,
  ): IShellConfigurator<string> {
    this.storage.environment = {
      ...this.storage.environment,
      ...(values as Record<string, string>),
    };
    return this;
  }

  /** @inheritdoc */
  public aliases(values: Record<string, string>): IShellConfigurator<string> {
    this.storage.aliases = {
      ...this.storage.aliases,
      ...values,
    };
    return this;
  }

  /** @inheritdoc */
  public sourceFile(relativePath: string): IShellConfigurator<string> {
    const resolvedPath = this.resolvePath(relativePath);
    const functionName = this.generateSourceFileFunctionName();

    // Create a function that cats the file content (with existence check)
    const functionBody = this.createSourceFileFunctionBody(resolvedPath);
    this.storage.functions[functionName] = functionBody;

    // Add raw scripts to source the function output and then unset the function
    const sourceCommand = this.createSourceFunctionCommand(functionName);
    const unsetCommand = this.createUnsetFunctionCommand(functionName);
    this.storage.scripts.push(raw(sourceCommand));
    this.storage.scripts.push(raw(unsetCommand));

    return this;
  }

  /** @inheritdoc */
  public sourceFunction(functionName: string): IShellConfigurator<string> {
    const command: string = this.createSourceFunctionCommand(functionName);
    this.storage.scripts.push(raw(command));
    return this;
  }

  /** @inheritdoc */
  public source(content: string): IShellConfigurator<string> {
    const functionName = this.generateSourceFunctionName();

    // Create a function with the inline content
    // Unlike sourceFile, this doesn't check for file existence - it just outputs the content
    this.storage.functions[functionName] = content;

    // Add raw scripts to source the function output and then unset the function
    const sourceCommand = this.createSourceFunctionCommand(functionName);
    const unsetCommand = this.createUnsetFunctionCommand(functionName);
    this.storage.scripts.push(raw(sourceCommand));
    this.storage.scripts.push(raw(unsetCommand));

    return this;
  }

  /** @inheritdoc */
  public completions(completion: ShellCompletionConfigInput): IShellConfigurator<string> {
    // Store the raw resolvable input - resolution happens at generation time
    // when version and other context properties are available
    this.storage.completions = completion;
    return this;
  }

  /** @inheritdoc */
  public once(script: string): IShellConfigurator<string> {
    this.storage.scripts.push(once(script));
    return this;
  }

  /** @inheritdoc */
  public always(script: string): IShellConfigurator<string> {
    this.storage.scripts.push(always(script));
    return this;
  }

  /** @inheritdoc */
  public functions<K extends string>(values: Record<K, string>): IShellConfigurator<string> {
    const validatedFunctions = this.validateFunctionNames(values);
    this.storage.functions = {
      ...this.storage.functions,
      ...validatedFunctions,
    };
    return this;
  }

  /** @inheritdoc */
  public path(pathValue: Resolvable<void, string>): IShellConfigurator<string> {
    this.storage.paths.push(pathValue);
    return this;
  }

  /**
   * Validates function names and filters out invalid ones with error logging.
   */
  private validateFunctionNames(values: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [functionName, functionBody] of Object.entries(values)) {
      if (!functionName || !VALID_FUNCTION_NAME_PATTERN.test(functionName)) {
        this.logger.error(messages.invalidFunctionName(functionName));
        continue;
      }
      result[functionName] = functionBody;
    }

    return result;
  }

  /**
   * Generates a unique function name for sourceFile operations.
   * Uses a prefix that indicates it's an internal function and should be unset after use.
   */
  private generateSourceFileFunctionName(): string {
    const counter = this.sourceFileCounter++;
    const sanitizedToolName = this.toolName.replace(/[^a-zA-Z0-9]/gu, '_');
    return `__dotfiles_source_${sanitizedToolName}_${counter}`;
  }

  /**
   * Generates a unique function name for source operations.
   * Uses a prefix that indicates it's an internal function and should be unset after use.
   */
  private generateSourceFunctionName(): string {
    const counter = this.sourceCounter++;
    const sanitizedToolName = this.toolName.replace(/[^a-zA-Z0-9]/gu, '_');
    return `__dotfiles_source_inline_${sanitizedToolName}_${counter}`;
  }

  /**
   * Creates the function body for sourceFile that cats the file content.
   */
  private createSourceFileFunctionBody(resolvedPath: string): string {
    const quotedPath = JSON.stringify(resolvedPath);

    if (this.shellType === 'powershell') {
      return `if (Test-Path ${quotedPath}) { Get-Content ${quotedPath} -Raw }`;
    }

    return `[[ -f ${quotedPath} ]] && cat ${quotedPath}`;
  }

  /**
   * Creates the shell command to unset/remove a function.
   */
  private createUnsetFunctionCommand(functionName: string): string {
    if (this.shellType === 'powershell') {
      return `Remove-Item Function:\\${functionName} -ErrorAction SilentlyContinue`;
    }

    return `unset -f ${functionName}`;
  }

  /**
   * Creates the shell command to source the output of a function.
   * No existence check - the function output is sourced directly.
   */
  private createSourceFunctionCommand(functionName: string): string {
    if (this.shellType === 'powershell') {
      return `. (${functionName})`;
    }

    return `source <(${functionName})`;
  }

  /**
   * Resolves a relative path to an absolute path based on the tool context.
   * Relative paths are resolved against toolDir (the .tool.ts file's directory).
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
      return this.normalizePath(trimmedPath);
    }

    if (!this.context) {
      const message = messages.configurationFieldRequired(
        'tool context',
        `Please ensure createInstallFunction receives tool context before using shell.sourceFile() for "${this.toolName}"`,
      );
      this.logger.error(message);
      throw new Error(message);
    }

    const resolvedPath = resolveToolRelativePath(this.context.toolDir, trimmedPath);
    return this.normalizePath(resolvedPath);
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
}
