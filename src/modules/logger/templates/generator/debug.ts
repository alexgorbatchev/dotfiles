import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const generatorDebugTemplates = {
  orchestratorInit: (): SafeLogMessage => createSafeLogMessage('Initializing GeneratorOrchestrator'),
  shimGenerate: (): SafeLogMessage => createSafeLogMessage('Calling shimGenerator.generate with options: %o'),
  shellGenerate: (): SafeLogMessage => createSafeLogMessage('Calling shellInitGenerator.generate with options: %o'),
  symlinkGenerate: (): SafeLogMessage => createSafeLogMessage('Calling symlinkGenerator.generate with options: %o'),
  orchestrationComplete: (): SafeLogMessage => createSafeLogMessage('Orchestration complete using %s'),
  methodEntry: (): SafeLogMessage => createSafeLogMessage('Method entry. Options: %o, FileSystem: %s'),
  parsedOptions: (): SafeLogMessage => createSafeLogMessage('Parsed options: toolConfigsCount=%d'),
  shimGenerationComplete: (): SafeLogMessage => createSafeLogMessage('Shim generation complete. %d shims recorded'),
  shellInitComplete: (): SafeLogMessage => createSafeLogMessage('Shell init generation complete. Recorded path: %s'),
  symlinkGenerationComplete: (): SafeLogMessage =>
    createSafeLogMessage('Symlink generation complete. %d symlink operations recorded'),
} as const;
