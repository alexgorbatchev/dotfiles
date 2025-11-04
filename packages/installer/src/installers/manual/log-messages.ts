import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  installing: (toolName: string) => createSafeLogMessage(`installManually: toolName=${toolName}`),
  multipleBinariesNotSupported: (binaryName: string) =>
    createSafeLogMessage(`Manual installation with multiple binaries not fully supported for ${binaryName}`),
} as const satisfies SafeLogMessageMap;
