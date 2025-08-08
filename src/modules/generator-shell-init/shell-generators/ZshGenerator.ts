import type { ShellType } from '@types';
import type { YamlConfig } from '@modules/config';
import { BaseShellGenerator } from './BaseShellGenerator';
import { ZshStringProducer } from './ZshStringProducer';

/**
 * Zsh-specific shell initialization generator.
 * Handles Zsh syntax and conventions for PATH, environment variables,
 * completions, and tool-specific initialization.
 */
export class ZshGenerator extends BaseShellGenerator {
  readonly shellType: ShellType = 'zsh';
  readonly fileExtension: string = '.zsh';

  constructor(appConfig: YamlConfig) {
    super(appConfig, new ZshStringProducer(appConfig));
  }

}