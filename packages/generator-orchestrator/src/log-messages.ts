import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const generatorOrchestratorLogMessages = {
  constructor: {
    initialized: () => createSafeLogMessage('Initializing GeneratorOrchestrator'),
  } satisfies SafeLogMessageMap,
  generateAll: {
    methodEntry: (fileSystemName: string) =>
      createSafeLogMessage(`generateAll invoked using file system ${fileSystemName}`),
    parsedOptions: (toolConfigsCount: number) =>
      createSafeLogMessage(`Parsed ${toolConfigsCount} tool configuration entries`),
    shimGenerate: () => createSafeLogMessage('Generating shims with resolved options'),
    shimGenerationComplete: (generatedCount: number) =>
      createSafeLogMessage(`Shim generation completed with ${generatedCount} paths recorded`),
    shellGenerate: () => createSafeLogMessage('Generating shell initialization files with resolved options'),
    shellInitComplete: (primaryPath: string) =>
      createSafeLogMessage(`Shell initialization generation complete; primary path: ${primaryPath}`),
    symlinkGenerate: () => createSafeLogMessage('Generating symlinks with resolved options'),
    symlinkGenerationComplete: (resultCount: number) =>
      createSafeLogMessage(`Symlink generation completed with ${resultCount} operations recorded`),
    completed: (context?: string) =>
      createSafeLogMessage(`Generator orchestration complete${context ? ` (${context})` : ''}`),
  } satisfies SafeLogMessageMap,
} as const;
