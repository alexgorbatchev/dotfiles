import path from 'node:path';
import type { ShellType } from '@dotfiles/schemas';
import { dedentString } from '@dotfiles/utils';
import type { InitializationOutput, IScriptInitializer } from './IScriptInitializer';

/**
 * Initializer for once scripts - adds sourcing loop to main shell file
 * to execute all once scripts in the .once/ directory
 */
export class OnceScriptInitializer implements IScriptInitializer {
  initialize(shellType: ShellType, shellScriptsDir: string): InitializationOutput {
    const onceDir = path.join(shellScriptsDir, '.once');
    const content = this.generateSourcingLoop(shellType, onceDir);

    return { content };
  }

  private generateSourcingLoop(shellType: ShellType, onceDir: string): string {
    switch (shellType) {
      case 'zsh':
        return this.generateZshSourcingLoop(onceDir);
      case 'bash':
        return this.generateBashSourcingLoop(onceDir);
      case 'powershell':
        return this.generatePowerShellSourcingLoop(onceDir);
      default:
        throw new Error(`Unsupported shell type: ${shellType}`);
    }
  }

  private generateZshSourcingLoop(onceDir: string): string {
    return dedentString(`
      # Execute once scripts (runs only once per script)
      for once_script in "${onceDir}"/*.zsh(N); do
        [[ -f "$once_script" ]] && source "$once_script"
      done
    `);
  }

  private generateBashSourcingLoop(onceDir: string): string {
    return dedentString(`
      # Execute once scripts (runs only once per script)
      shopt -s nullglob
      for once_script in "${onceDir}"/*.bash; do
        [[ -f "$once_script" ]] && source "$once_script"
      done
      shopt -u nullglob
    `);
  }

  private generatePowerShellSourcingLoop(onceDir: string): string {
    return dedentString(`
      # Execute once scripts (runs only once per script)
      Get-ChildItem -Path "${onceDir}\\*.ps1" -ErrorAction SilentlyContinue | ForEach-Object {
        if (Test-Path $_.FullName) {
          & $_.FullName
        }
      }
    `);
  }
}
