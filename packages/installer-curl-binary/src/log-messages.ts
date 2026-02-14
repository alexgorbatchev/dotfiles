import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  installing: (toolName: string) => createSafeLogMessage(`Installing from curl-binary: toolName=${toolName}`),
  downloadingBinary: (url: string) => createSafeLogMessage(`Downloading binary from: ${url}`),
  binaryDownloaded: () => createSafeLogMessage('Binary downloaded successfully'),
  settingPermissions: () => createSafeLogMessage('Setting binary executable permissions'),
} as const satisfies SafeLogMessageMap;
