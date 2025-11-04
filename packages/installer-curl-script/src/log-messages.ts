import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  installing: (toolName: string) => createSafeLogMessage(`Installing from curl-script: toolName=${toolName}`),
  downloadingScript: (url: string) => createSafeLogMessage(`Downloading install script from: ${url}`),
  executingScript: (shell: string) => createSafeLogMessage(`Executing install script using: ${shell}`),
} as const satisfies SafeLogMessageMap;
