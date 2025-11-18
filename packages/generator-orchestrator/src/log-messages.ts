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
