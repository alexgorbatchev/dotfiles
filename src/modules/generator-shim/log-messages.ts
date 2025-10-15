import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '@modules/logger/utils';

export const shimGeneratorLogMessages = {
  constructor: {
    initialized: () => createSafeLogMessage('ShimGenerator initialized'),
  } satisfies SafeLogMessageMap,
  generate: {
    started: (fileSystemName: string) =>
      createSafeLogMessage(`Starting shim generation using ${fileSystemName}`),
    missingToolConfig: (toolName: string) =>
      createSafeLogMessage(`Skipping shim generation for ${toolName} because configuration is missing`),
  } satisfies SafeLogMessageMap,
  generateForTool: {
    started: (toolName: string, fileSystemName: string) =>
      createSafeLogMessage(`Generating shims for ${toolName} using ${fileSystemName}`),
  } satisfies SafeLogMessageMap,
  generateShim: {
    resolvedShimPath: (shimPath: string) => createSafeLogMessage(`Resolved shim output path ${shimPath}`),
    existingShim: (shimPath: string) =>
      createSafeLogMessage(`Existing shim found at ${shimPath}; overwrite is disabled`),
    conflictingFile: (toolName: string, shimPath: string) =>
      createSafeLogMessage(
        `Cannot create shim for "${toolName}": conflicting file exists at ${shimPath}. Use --overwrite to replace it.`
      ),
    resolvedBinaryPath: (toolName: string, binaryName: string, binaryPath: string) =>
      createSafeLogMessage(`Resolved binary path for ${toolName}/${binaryName} to ${binaryPath}`),
    generatedContent: (binaryName: string) =>
      createSafeLogMessage(`Generated shim content for ${binaryName}`),
    success: (binaryName: string, shimPath: string, fileSystemName: string) =>
      createSafeLogMessage(`Generated shim ${binaryName} at ${shimPath} using ${fileSystemName}`),
  } satisfies SafeLogMessageMap,
} as const;
