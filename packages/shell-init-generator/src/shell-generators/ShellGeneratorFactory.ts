import type { YamlConfig } from '@dotfiles/config';
import type { ShellType } from '@dotfiles/core';
import { BashGenerator } from './BashGenerator';
import type { IShellGenerator } from './IShellGenerator';
import { PowerShellGenerator } from './PowerShellGenerator';
import { ZshGenerator } from './ZshGenerator';

/**
 * Map of shell types to their generator factory functions.
 */
const generators = new Map<ShellType, (appConfig: YamlConfig) => IShellGenerator>([
  ['zsh', (appConfig: YamlConfig) => new ZshGenerator(appConfig)],
  ['bash', (appConfig: YamlConfig) => new BashGenerator(appConfig)],
  ['powershell', (appConfig: YamlConfig) => new PowerShellGenerator(appConfig)],
]);

/**
 * Creates a shell generator for the specified shell type.
 * @param shellType - The shell type to create a generator for
 * @param appConfig - Application configuration
 * @returns Shell generator instance
 * @throws Error if the shell type is not supported
 */
export function createGenerator(shellType: ShellType, appConfig: YamlConfig): IShellGenerator {
  const generatorFactory = generators.get(shellType);
  if (!generatorFactory) {
    throw new Error(`Unsupported shell type: ${shellType}`);
  }
  return generatorFactory(appConfig);
}

/**
 * Gets all supported shell types.
 * @returns Array of supported shell types
 */
export function getSupportedShellTypes(): ShellType[] {
  return Array.from(generators.keys());
}

/**
 * Creates generators for all supported shell types.
 * @param appConfig - Application configuration
 * @returns Map of shell type to generator instance
 */
export function createAllGenerators(appConfig: YamlConfig): Map<ShellType, IShellGenerator> {
  const result = new Map<ShellType, IShellGenerator>();
  for (const [shellType, factory] of generators) {
    result.set(shellType, factory(appConfig));
  }
  return result;
}

/**
 * Checks if a shell type is supported.
 * @param shellType - Shell type to check
 * @returns True if the shell type is supported
 */
export function isSupported(shellType: string): shellType is ShellType {
  return generators.has(shellType as ShellType);
}
