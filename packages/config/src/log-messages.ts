import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const configLoaderLogMessages = {
  configurationProcessing: () => createSafeLogMessage('config processing'),
  platformOverrides: (platform: string, arch: string) =>
    createSafeLogMessage(`platform overrides: ${platform} ${arch}`),
  configurationValidated: (context: string) => createSafeLogMessage(`Configuration validated successfully: ${context}`),
  configurationValidationFailed: (errors: string[]) =>
    createSafeLogMessage(`Configuration validation failed:\n${errors.join('\n')}`),
  configurationParseError: (configPath: string, format: string, reason: string) =>
    createSafeLogMessage(`Failed to parse ${format} configuration ${configPath}: ${reason}`),
  configurationLoadFailed: (toolPath: string, reason: string) => createSafeLogMessage(`${toolPath}: ${reason}`),
  configurationLoaded: (configPath: string, toolCount: number) =>
    createSafeLogMessage(`Configuration loaded from ${configPath} (${toolCount} tools configured)`),
  toolConfigLoadingStarted: (toolConfigsDir: string) => createSafeLogMessage(`tool config loading: ${toolConfigsDir}`),
  singleToolConfigLoadingStarted: (toolName: string, toolConfigsDir: string) =>
    createSafeLogMessage(`single tool config load: ${toolName} in ${toolConfigsDir}`),
  toolConfigDirectoryScan: (toolConfigsDir: string) => createSafeLogMessage(`directory scan: ${toolConfigsDir}`),
  toolConfigEntryLoad: (filePath: string) => createSafeLogMessage(`tool config load: ${filePath}`),
  toolConfigLoadingCompleted: () => createSafeLogMessage('tool config loading completed'),
  configurationFieldInvalid: (field: string, value: string, expected: string) =>
    createSafeLogMessage(`Invalid ${field}: "${value}" (expected ${expected})`),
  fsItemNotFound: (itemType: string, path: string) => createSafeLogMessage(`${itemType} not found: ${path}`),
  fsReadFailed: (path: string, reason: string) => createSafeLogMessage(`Failed to read ${path}: ${reason}`),
} satisfies SafeLogMessageMap;
