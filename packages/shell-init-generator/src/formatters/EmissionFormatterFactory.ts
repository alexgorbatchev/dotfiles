import type { ShellType } from '@dotfiles/core';
import type { FormatterConfig, IEmissionFormatter } from '@dotfiles/shell-emissions';
import { BashEmissionFormatter } from './BashEmissionFormatter';
import { PowerShellEmissionFormatter } from './PowerShellEmissionFormatter';
import { ZshEmissionFormatter } from './ZshEmissionFormatter';

/**
 * Creates an emission formatter for the specified shell type.
 */
export function createEmissionFormatter(
  shellType: ShellType,
  config: FormatterConfig,
): IEmissionFormatter {
  switch (shellType) {
    case 'zsh':
      return new ZshEmissionFormatter(config);
    case 'bash':
      return new BashEmissionFormatter(config);
    case 'powershell':
      return new PowerShellEmissionFormatter(config);
    default:
      throw new Error(`Unsupported shell type: ${shellType}`);
  }
}
