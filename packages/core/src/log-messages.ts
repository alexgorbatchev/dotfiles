import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  pluginAlreadyRegistered: (method: string) =>
    createSafeLogMessage(`Plugin ${method} is already registered, replacing...`),

  pluginRegistered: (method: string, displayName: string, version: string) =>
    createSafeLogMessage(`Registered installer plugin: ${method} (${displayName} v${version})`),

  pluginRegistrationFailed: (method: string) => createSafeLogMessage(`Failed to register plugin ${method}`),

  schemasComposed: (count: number, methods: string) =>
    createSafeLogMessage(`Composed schemas from ${count} plugins: ${methods}`),

  noPluginForMethod: (method: string, availableMethods: string) =>
    createSafeLogMessage(
      `No plugin registered for installation method: ${method}. Available methods: ${availableMethods}`
    ),

  pluginValidationFailed: (errors: string) => createSafeLogMessage(`Plugin validation failed: ${errors}`),

  validationFailed: (method: string, errors: string) =>
    createSafeLogMessage(`Plugin validation failed for ${method}: ${errors}`),

  validationWarning: (method: string, warning: string) =>
    createSafeLogMessage(`Validation warning for ${method}: ${warning}`),

  delegatingToPlugin: (method: string) => createSafeLogMessage(`Delegating installation to plugin: ${method}`),

  validationCacheCleared: () => createSafeLogMessage('Validation cache cleared'),

  cleaningUpPlugins: () => createSafeLogMessage('Cleaning up plugins...'),

  pluginCleanedUp: (method: string) => createSafeLogMessage(`Cleaned up plugin: ${method}`),

  pluginCleanupFailed: (method: string) => createSafeLogMessage(`Failed to cleanup plugin ${method}`),

  pluginCleanupComplete: () => createSafeLogMessage('Plugin cleanup complete'),

  replaceInFileNoMatch: (pattern: string, filePath: string) =>
    createSafeLogMessage(`Could not find '${pattern}' in ${filePath}`),
} satisfies SafeLogMessageMap;
