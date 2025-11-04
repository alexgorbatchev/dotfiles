import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  installing: (toolName: string) => createSafeLogMessage(`Installing from curl-tar: toolName=${toolName}`),
  downloadingArchive: (url: string) => createSafeLogMessage(`Downloading archive from: ${url}`),
  archiveExtracted: () => createSafeLogMessage('Archive extracted: %o'),
  cleaningArchive: (archivePath: string) => createSafeLogMessage(`Cleaning up downloaded archive: ${archivePath}`),
} as const satisfies SafeLogMessageMap;
