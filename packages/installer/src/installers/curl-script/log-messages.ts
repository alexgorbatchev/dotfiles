import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  installing: (toolName: string) => createSafeLogMessage(`installFromCurlScript: toolName=${toolName}`),
  downloadingScript: (url: string) => createSafeLogMessage(`installFromCurlScript: Downloading script from ${url}`),
  executingScript: (shell: string) => createSafeLogMessage(`installFromCurlScript: Executing script with ${shell}`),
} as const satisfies SafeLogMessageMap;
