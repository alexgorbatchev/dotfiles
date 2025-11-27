import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  installing: (toolName: string) => createSafeLogMessage(`Installing from curl-script: toolName=${toolName}`),
  downloadingScript: (url: string) => createSafeLogMessage(`Downloading install script from: ${url}`),
  executingScript: (shell: string) => createSafeLogMessage(`Executing install script using: ${shell}`),
  movingBinary: (sourcePath: string, targetPath: string) =>
    createSafeLogMessage(`Moving binary from ${sourcePath} to ${targetPath}`),
} as const satisfies SafeLogMessageMap;
