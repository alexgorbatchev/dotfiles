import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  constructor: {
    initialized: () => createSafeLogMessage('Initializing GeneratorOrchestrator'),
  } satisfies SafeLogMessageMap,
  generateAll: {
    parsedOptions: (toolConfigsCount: number) =>
      createSafeLogMessage(`Parsed ${toolConfigsCount} tool configuration entries`),
    dependenciesValidationStarted: (toolCount: number) =>
      createSafeLogMessage(`Validating tool dependencies (${toolCount} tools)`),
    dependenciesOrderResolved: (orderedTools: string) =>
      createSafeLogMessage(`Dependency order resolved: ${orderedTools}`),
    missingDependency: (toolName: string, dependencyName: string, platform: string, arch: string) =>
      createSafeLogMessage(
        `Missing dependency: tool "${toolName}" requires binary "${dependencyName}" but no tool provides it for platform ${platform}/${arch}.`
      ),
    ambiguousDependency: (dependencyName: string, providers: string, toolName: string) =>
      createSafeLogMessage(
        `Ambiguous dependency: binary "${dependencyName}" is provided by multiple tools (${providers}). Tool "${toolName}" cannot determine which to use.`
      ),
    circularDependency: (tools: string) => createSafeLogMessage(`Circular dependency detected between tools: ${tools}`),
    shimGenerate: () => createSafeLogMessage('Generating shims with resolved options'),
    shimGenerationComplete: (generatedCount: number) =>
      createSafeLogMessage(`Shim generation completed with ${generatedCount} paths recorded`),
    shellGenerate: () => createSafeLogMessage('Generating shell initialization files with resolved options'),
    shellInitComplete: (primaryPath: string) =>
      createSafeLogMessage(`Shell initialization generation complete; primary path: ${primaryPath}`),
    symlinkGenerationComplete: (resultCount: number) =>
      createSafeLogMessage(`Symlink generation completed with ${resultCount} operations recorded`),
    completed: (context?: string) =>
      createSafeLogMessage(`Generator orchestration complete${context ? ` (${context})` : ''}`),
  } satisfies SafeLogMessageMap,
} as const;
