import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  installing: (toolName: string) => createSafeLogMessage(`installFromCurlTar: toolName=${toolName}`),
  downloadingTarball: (url: string) => createSafeLogMessage(`installFromCurlTar: Downloading tarball from ${url}`),
  extractingTarball: () => createSafeLogMessage('installFromCurlTar: Extracting tarball'),
  tarballExtracted: () => createSafeLogMessage('installFromCurlTar: Tarball extracted: %o'),
  cleaningArchive: (tarballPath: string) =>
    createSafeLogMessage(`installFromCurlTar: Cleaning up downloaded archive: ${tarballPath}`),
} as const satisfies SafeLogMessageMap;
