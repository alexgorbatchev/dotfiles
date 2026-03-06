import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  constructor: {
    initialized: () => createSafeLogMessage('Initializing GeneratorOrchestrator'),
  } satisfies SafeLogMessageMap,
  autoInstall: {
    completed: (toolName: string) => createSafeLogMessage(`Auto-installed: ${toolName}`),
  } satisfies SafeLogMessageMap,
  generateAll: {
    parsedOptions: (toolConfigsCount: number) =>
      createSafeLogMessage(`Parsed ${toolConfigsCount} tool configuration entries`),
    toolDisabled: (toolName: string) => createSafeLogMessage(`Skipping disabled tool: ${toolName}`),
    toolHostnameMismatch: (toolName: string, pattern: string, currentHostname: string) =>
      createSafeLogMessage(
        `Skipping tool "${toolName}": hostname "${currentHostname}" does not match pattern "${pattern}"`,
      ),
    dependenciesValidationStarted: (toolCount: number) =>
      createSafeLogMessage(`Validating tool dependencies (${toolCount} tools)`),
    dependenciesOrderResolved: (orderedTools: string) =>
      createSafeLogMessage(`Dependency order resolved: ${orderedTools}`),
    missingDependency: (toolName: string, dependencyName: string, platform: string, arch: string) =>
      createSafeLogMessage(
        `Missing dependency: tool "${toolName}" requires binary "${dependencyName}" but no tool provides it for platform ${platform}/${arch}.`,
      ),
    ambiguousDependency: (dependencyName: string, providers: string, toolName: string) =>
      createSafeLogMessage(
        `Ambiguous dependency: binary "${dependencyName}" is provided by multiple tools (${providers}). Tool "${toolName}" cannot determine which to use.`,
      ),
    circularDependency: (tools: string) => createSafeLogMessage(`Circular dependency detected between tools: ${tools}`),
    shimGenerate: () => createSafeLogMessage('Generating shims with resolved options'),
    shimGenerationComplete: (generatedCount: number) =>
      createSafeLogMessage(`Shim generation completed with ${generatedCount} paths recorded`),
    shellGenerate: () => createSafeLogMessage('Generating shell initialization files with resolved options'),
    shellInitComplete: (primaryPath: string) =>
      createSafeLogMessage(`Shell initialization generation complete; primary path: ${primaryPath}`),
    completionGenerated: (filename: string, toolName: string, shellType: string) =>
      createSafeLogMessage(`Generated completion ${filename} for ${toolName} (${shellType})`),
    completionGeneratedAtPath: (completionPath: string) =>
      createSafeLogMessage(`Generated completion at ${completionPath}`),
    completionGenerationFailed: (toolName: string, shellType: string) =>
      createSafeLogMessage(`Failed to generate completion for ${toolName} (${shellType})`),
    completionSkippedNotInstalled: (toolName: string, shellType: string) =>
      createSafeLogMessage(`Skipping completion generation for ${toolName} (${shellType}) - tool not installed yet`),
    symlinkGenerationComplete: (resultCount: number) =>
      createSafeLogMessage(`Symlink generation completed with ${resultCount} operations recorded`),
    copyGenerationComplete: (resultCount: number) =>
      createSafeLogMessage(`Copy generation completed with ${resultCount} operations recorded`),
  } satisfies SafeLogMessageMap,
  cleanup: {
    started: (toolName: string) => createSafeLogMessage(`Cleaning up artifacts for disabled tool: ${toolName}`),
    noFilesToCleanup: (toolName: string) =>
      createSafeLogMessage(`No tracked artifacts found to clean up for: ${toolName}`),
    filesFound: (toolName: string, count: number) =>
      createSafeLogMessage(`Found ${count} artifacts to clean up for: ${toolName}`),
    fileDeleted: (filePath: string, fileType: string) => createSafeLogMessage(`Removed ${fileType}: ${filePath}`),
    deleteError: (filePath: string, _error: unknown) => createSafeLogMessage(`Failed to delete: ${filePath}`),
    completed: (toolName: string, count: number) =>
      createSafeLogMessage(`Cleanup completed for ${toolName}: ${count} files removed`),
  } satisfies SafeLogMessageMap,
  orphanCleanup: {
    found: (count: number) =>
      createSafeLogMessage(`Found ${count} orphaned tool${count === 1 ? '' : 's'} with no configuration`),
    cleaningUp: () => createSafeLogMessage('Cleaning up orphaned tool'),
  } satisfies SafeLogMessageMap,
  staleSymlinkCleanup: {
    removing: (filePath: string, toolName: string) =>
      createSafeLogMessage(`Removing stale symlink ${filePath} for tool: ${toolName}`),
  } satisfies SafeLogMessageMap,
  staleCopyCleanup: {
    removing: (filePath: string, toolName: string) =>
      createSafeLogMessage(`Removing stale copy ${filePath} for tool: ${toolName}`),
  } satisfies SafeLogMessageMap,
} as const;
