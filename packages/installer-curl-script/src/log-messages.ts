import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  installing: (toolName: string) => createSafeLogMessage(`Installing from curl-script: toolName=${toolName}`),
  downloadingScript: (url: string) => createSafeLogMessage(`Downloading install script from: ${url}`),
  executingScript: (shell: string) => createSafeLogMessage(`Executing install script using: ${shell}`),
  movingBinary: (sourcePath: string, targetPath: string) =>
    createSafeLogMessage(`Moving binary from ${sourcePath} to ${targetPath}`),
  binaryFoundInInstallDir: (path: string) => createSafeLogMessage(`Binary found in install directory: ${path}`),
  binaryNotFound: (binaryName: string, searchPaths: string) =>
    createSafeLogMessage(`Binary ${binaryName} not found in search paths: ${searchPaths}`),
  detectedVersion: (version: string) => createSafeLogMessage(`Detected version: ${version}`),
  versionDetectionFailed: (error: string) => createSafeLogMessage(`Failed to detect version: ${error}`),
} as const satisfies SafeLogMessageMap;
