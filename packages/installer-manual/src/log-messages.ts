import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  installing: (toolName: string) => createSafeLogMessage(`Manual installation: toolName=${toolName}`),
  manualInstructions: () => createSafeLogMessage('Manual installation requires user action'),
  multipleBinariesNotSupported: () => createSafeLogMessage('Manual installation does not support multiple binaries'),
} as const satisfies SafeLogMessageMap;
