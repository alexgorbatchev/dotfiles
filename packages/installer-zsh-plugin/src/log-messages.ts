import { createSafeLogMessage, type SafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  installing: (toolName: string): SafeLogMessage => createSafeLogMessage(`Installing zsh plugin: ${toolName}`),
  cloning: (url: string, dest: string): SafeLogMessage => createSafeLogMessage(`Cloning ${url} to ${dest}`),
  updating: (pluginPath: string): SafeLogMessage => createSafeLogMessage(`Updating existing plugin at ${pluginPath}`),
  cloneSuccess: (pluginName: string): SafeLogMessage => createSafeLogMessage(`Cloned plugin: ${pluginName}`),
  updateSuccess: (pluginName: string): SafeLogMessage => createSafeLogMessage(`Updated plugin: ${pluginName}`),
  cloneFailed: (url: string): SafeLogMessage => createSafeLogMessage(`Failed to clone: ${url}`),
  updateFailed: (pluginPath: string): SafeLogMessage => createSafeLogMessage(`Failed to update: ${pluginPath}`),
  versionDetected: (version: string): SafeLogMessage => createSafeLogMessage(`Detected version: ${version}`),
  sourceFileDetected: (file: string): SafeLogMessage => createSafeLogMessage(`Detected source file: ${file}`),
  sourceFileNotFound: (file: string): SafeLogMessage =>
    createSafeLogMessage(`Specified source file not found: ${file}`),
  noParamsProvided: (): SafeLogMessage => createSafeLogMessage('No install parameters provided'),
  invalidParams: (): SafeLogMessage => createSafeLogMessage('Either repo or url must be specified'),
  updateCheckNotImplemented: (toolName: string): SafeLogMessage =>
    createSafeLogMessage(`Update check not implemented for zsh-plugin: ${toolName}`),
} as const satisfies SafeLogMessageMap;
