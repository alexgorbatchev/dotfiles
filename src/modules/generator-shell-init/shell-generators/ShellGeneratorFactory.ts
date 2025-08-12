import type { YamlConfig } from '@modules/config';
import type { ShellType } from '@types';
import { BashGenerator } from './BashGenerator';
import type { IShellGenerator } from './IShellGenerator';
import { PowerShellGenerator } from './PowerShellGenerator';
import { ZshGenerator } from './ZshGenerator';

/**
 * Factory for creating shell-specific generators.
 * Provides centralized access to all supported shell generators.
 */
export class ShellGeneratorFactory {
  private static readonly generators = new Map<ShellType, (appConfig: YamlConfig) => IShellGenerator>([
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
  static createGenerator(shellType: ShellType, appConfig: YamlConfig): IShellGenerator {
    const generatorFactory = ShellGeneratorFactory.generators.get(shellType);
    if (!generatorFactory) {
      throw new Error(`Unsupported shell type: ${shellType}`);
    }
    return generatorFactory(appConfig);
  }

  /**
   * Gets all supported shell types.
   * @returns Array of supported shell types
   */
  static getSupportedShellTypes(): ShellType[] {
    return Array.from(ShellGeneratorFactory.generators.keys());
  }

  /**
   * Creates generators for all supported shell types.
   * @param appConfig - Application configuration
   * @returns Map of shell type to generator instance
   */
  static createAllGenerators(appConfig: YamlConfig): Map<ShellType, IShellGenerator> {
    const generators = new Map<ShellType, IShellGenerator>();
    for (const [shellType, factory] of ShellGeneratorFactory.generators) {
      generators.set(shellType, factory(appConfig));
    }
    return generators;
  }

  /**
   * Checks if a shell type is supported.
   * @param shellType - Shell type to check
   * @returns True if the shell type is supported
   */
  static isSupported(shellType: string): shellType is ShellType {
    return ShellGeneratorFactory.generators.has(shellType as ShellType);
  }
}
