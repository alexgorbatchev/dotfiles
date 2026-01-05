import type { IInstallContext } from '@dotfiles/core';
import type { TsLogger } from '@dotfiles/logger';
import { z } from 'zod';
import type { PluginEmittedHookEvent } from './builder/builder.types';
import { messages } from './log-messages';
import type {
  AggregateInstallResult,
  IInstallerPlugin,
  IInstallOptions,
  InstallResult,
  IValidationResult,
} from './types';

type InstallEventHandler = (event: InstallEvent) => Promise<void>;

export interface InstallEvent {
  type: PluginEmittedHookEvent;
  toolName: string;
  context: IInstallContext & Record<string, unknown>;
}

/**
 * Central registry for installer plugins
 */
export class InstallerPluginRegistry {
  private plugins = new Map<string, IInstallerPlugin>();
  private validationCache = new Map<string, IValidationResult>();
  private composedToolConfigSchema?: z.ZodTypeAny;
  private composedInstallParamsSchema?: z.ZodTypeAny;
  private logger: TsLogger;
  private schemasComposed = false;
  private eventHandlers: InstallEventHandler[] = [];

  constructor(parentLogger: TsLogger) {
    this.logger = parentLogger.getSubLogger({ name: 'InstallerPluginRegistry' });
  }

  /**
   * Register an event handler for installation events
   */
  onEvent(handler: InstallEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Emit an installation event to all registered handlers
   */
  async emitEvent(event: InstallEvent): Promise<void> {
    for (const handler of this.eventHandlers) {
      await handler(event);
    }
  }

  /**
   * Register a plugin (fails fast on error)
   */
  async register<T extends IInstallerPlugin>(plugin: T): Promise<void> {
    const { method } = plugin;

    try {
      // Validate plugin
      if (!method || typeof method !== 'string') {
        throw new Error('Plugin must have a valid method name');
      }

      if (this.schemasComposed) {
        throw new Error('Cannot register plugins after schemas have been composed');
      }

      if (this.plugins.has(method)) {
        this.logger.warn(messages.pluginAlreadyRegistered(method));
      }

      // Initialize plugin if needed
      if (plugin.initialize) {
        await plugin.initialize();
      }

      this.plugins.set(method, plugin);
      this.logger.debug(messages.pluginRegistered(method, plugin.displayName, plugin.version));
    } catch (error) {
      // Fail fast - don't skip invalid plugins
      this.logger.error(messages.pluginRegistrationFailed(method), error);
      throw new Error(`Plugin registration failed: ${method}`, { cause: error });
    }
  }

  /**
   * Get a plugin by method name
   */
  get(method: string): IInstallerPlugin | undefined {
    return this.plugins.get(method);
  }

  /**
   * Check if a plugin is registered
   */
  has(method: string): boolean {
    return this.plugins.has(method);
  }

  /**
   * Get all registered plugins
   */
  getAll(): IInstallerPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get all method names
   */
  getMethods(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Compose schemas from all registered plugins (call once after all plugins registered)
   */
  composeSchemas(): void {
    const plugins = this.getAll();

    if (plugins.length === 0) {
      throw new Error('No plugins registered');
    }

    // Compose tool config schema
    const toolConfigSchemas = plugins.map((plugin) => plugin.toolConfigSchema);
    if (toolConfigSchemas.length === 1) {
      this.composedToolConfigSchema = toolConfigSchemas[0];
    } else {
      // biome-ignore lint/suspicious/noExplicitAny: Zod discriminatedUnion requires specific tuple type that can't be inferred from runtime array
      this.composedToolConfigSchema = z.discriminatedUnion('installationMethod', toolConfigSchemas as any);
    }

    // Compose install params schema
    const paramsSchemas = plugins.map((plugin) => plugin.paramsSchema);
    if (paramsSchemas.length === 1) {
      this.composedInstallParamsSchema = paramsSchemas[0];
    } else {
      // biome-ignore lint/suspicious/noExplicitAny: Zod union requires specific tuple type that can't be inferred from runtime array
      this.composedInstallParamsSchema = z.union(paramsSchemas as any);
    }

    this.schemasComposed = true;
    this.logger.info(messages.schemasComposed(plugins.length, this.getMethods().join(', ')));
  }

  /**
   * Get the composed tool config schema (throws if not composed yet)
   */
  getToolConfigSchema(): z.ZodTypeAny {
    if (!this.composedToolConfigSchema) {
      throw new Error('Schemas not composed. Call composeSchemas() after registering all plugins.');
    }
    return this.composedToolConfigSchema;
  }

  /**
   * Get the composed install params schema (throws if not composed yet)
   */
  getInstallParamsSchema(): z.ZodTypeAny {
    if (!this.composedInstallParamsSchema) {
      throw new Error('Schemas not composed. Call composeSchemas() after registering all plugins.');
    }
    return this.composedInstallParamsSchema;
  }

  /**
   * Validate plugin can run (with caching for static validations)
   */
  private async validatePlugin(
    plugin: IInstallerPlugin,
    context: IInstallContext,
    logger: TsLogger
  ): Promise<InstallResult | null> {
    if (!plugin.validate) {
      return null;
    }

    let validation = this.validationCache.get(plugin.method);

    if (!validation) {
      validation = await plugin.validate(context);

      if (plugin.staticValidation) {
        this.validationCache.set(plugin.method, validation);
      }
    }

    if (!validation.valid) {
      const error = `Plugin validation failed: ${validation.errors?.join(', ')}`;
      logger.error(messages.validationFailed(plugin.method, validation.errors?.join(', ') ?? 'Unknown error'));
      return {
        success: false,
        error,
      };
    }

    if (validation.warnings && validation.warnings.length > 0) {
      for (const warning of validation.warnings) {
        logger.warn(messages.validationWarning(plugin.method, warning));
      }
    }

    return null;
  }

  /**
   * Execute installation using appropriate plugin
   */
  async install(
    parentLogger: TsLogger,
    method: string,
    toolName: string,
    toolConfig: unknown,
    context: IInstallContext,
    options?: IInstallOptions
  ): Promise<AggregateInstallResult> {
    const logger = parentLogger.getSubLogger({ name: 'InstallerPluginRegistry' }).getSubLogger({ name: 'install' });
    const plugin = this.get(method);

    if (!plugin) {
      const error = `No plugin registered for installation method: ${method}. Available methods: ${this.getMethods().join(', ')}`;
      logger.error(messages.noPluginForMethod(method, this.getMethods().join(', ')));
      return {
        success: false,
        error,
      } as AggregateInstallResult;
    }

    const validationError = await this.validatePlugin(plugin, context, logger);
    if (validationError) {
      return validationError as AggregateInstallResult;
    }

    logger.debug(messages.delegatingToPlugin(method));
    return (await plugin.install(toolName, toolConfig, context, options, logger)) as AggregateInstallResult;
  }

  /**
   * Clear validation cache (useful for testing or when environment changes)
   */
  clearValidationCache(): void {
    this.validationCache.clear();
    this.logger.debug(messages.validationCacheCleared());
  }

  /**
   * Cleanup all plugins (useful for graceful shutdown)
   */
  async cleanup(): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'cleanup' });
    logger.info(messages.cleaningUpPlugins());

    const plugins = this.getAll();
    for (const plugin of plugins) {
      if (plugin.cleanup) {
        try {
          await plugin.cleanup();
          logger.debug(messages.pluginCleanedUp(plugin.method));
        } catch (error) {
          logger.error(messages.pluginCleanupFailed(plugin.method), error);
        }
      }
    }

    logger.info(messages.pluginCleanupComplete());
  }
}
