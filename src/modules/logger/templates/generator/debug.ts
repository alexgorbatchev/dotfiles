import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const generatorDebugTemplates = {
  orchestratorInit: (): SafeLogMessage => createSafeLogMessage('Initializing GeneratorOrchestrator'),
  configCritical: (): SafeLogMessage => createSafeLogMessage('CRITICAL - appConfig is null/undefined at method start'),
  pathsCritical: (): SafeLogMessage =>
    createSafeLogMessage('CRITICAL: paths.manifestPath is undefined/null on appConfig'),
  manifestRead: (): SafeLogMessage => createSafeLogMessage('Proceeding with manifest read/init using %s'),
  readFileCompleted: (): SafeLogMessage => createSafeLogMessage('readFile call completed'),
  existingManifest: (): SafeLogMessage => createSafeLogMessage('Existing manifest read and parsed successfully'),
  shimGenerate: (): SafeLogMessage => createSafeLogMessage('Calling shimGenerator.generate with options: %o'),
  shellGenerate: (): SafeLogMessage => createSafeLogMessage('Calling shellInitGenerator.generate with options: %o'),
  symlinkGenerate: (): SafeLogMessage => createSafeLogMessage('Calling symlinkGenerator.generate with options: %o'),
  manifestWritten: (): SafeLogMessage => createSafeLogMessage('Manifest written successfully'),
  orchestrationComplete: (): SafeLogMessage => createSafeLogMessage('Orchestration complete using %s'),
  methodEntry: (): SafeLogMessage => createSafeLogMessage('Method entry. Options: %o, FileSystem: %s'),
  manifestPath: (): SafeLogMessage => createSafeLogMessage('Initial appConfig.paths.manifestPath: %s'),
  parsedOptions: (): SafeLogMessage => createSafeLogMessage('Parsed options: generatorVersion=%s, toolConfigsCount=%d'),
  yamlConfigAvailable: (): SafeLogMessage => createSafeLogMessage('YamlConfig available. paths.manifestPath: %s'),
  manifestPathDetermined: (): SafeLogMessage => createSafeLogMessage('Manifest path determined as: %s'),
  fsExistsCompleted: (): SafeLogMessage => createSafeLogMessage('fs.exists call completed. manifestFileExists = %s'),
  existingManifestFound: (): SafeLogMessage => createSafeLogMessage('Existing manifest found at %s. Reading...'),
  noExistingManifest: (): SafeLogMessage =>
    createSafeLogMessage('No existing manifest found at %s. Creating a new one'),
  manifestReadError: (): SafeLogMessage =>
    createSafeLogMessage('Error reading or parsing existing manifest at %s. Defaulting to a new manifest. Error: %s'),
  shimGenerationComplete: (): SafeLogMessage => createSafeLogMessage('Shim generation complete. %d shims recorded'),
  shellInitComplete: (): SafeLogMessage => createSafeLogMessage('Shell init generation complete. Recorded path: %s'),
  symlinkGenerationComplete: (): SafeLogMessage =>
    createSafeLogMessage('Symlink generation complete. %d symlink operations recorded'),
  writingManifest: (): SafeLogMessage => createSafeLogMessage('Writing updated manifest to %s using %s'),
  manifestWriteFailed: (): SafeLogMessage => createSafeLogMessage('Failed to write manifest to %s. Error: %s'),
} as const;
