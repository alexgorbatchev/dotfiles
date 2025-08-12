import type { YamlConfig } from '@modules/config';
import type { ShellType } from '@types';
import { BaseShellGenerator } from './BaseShellGenerator';
import { BashStringProducer } from './BashStringProducer';

/**
 * Bash-specific shell initialization generator.
 * Handles Bash syntax and conventions for PATH, environment variables,
 * completions, and tool-specific initialization.
 */
export class BashGenerator extends BaseShellGenerator {
  readonly shellType: ShellType = 'bash';
  readonly fileExtension: string = '.bash';

  constructor(appConfig: YamlConfig) {
    super(appConfig, new BashStringProducer(appConfig));
  }
}
