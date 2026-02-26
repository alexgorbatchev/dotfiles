import type {
  AliasEmission,
  CompletionEmission,
  Emission,
  EnvironmentEmission,
  FunctionEmission,
  IEmissionFormatter,
  OnceScriptContent,
  PathEmission,
  ScriptEmission,
  SourceEmission,
  SourceFileEmission,
  SourceFunctionEmission,
} from '@dotfiles/shell-emissions';
import {
  isAliasEmission,
  isCompletionEmission,
  isEnvironmentEmission,
  isFunctionEmission,
  isPathEmission,
  isScriptEmission,
  isSourceEmission,
  isSourceFileEmission,
  isSourceFunctionEmission,
  ONCE_SCRIPT_INDEX_PAD_LENGTH,
} from '@dotfiles/shell-emissions';
import { dedentString } from '@dotfiles/utils';
import { BaseEmissionFormatter } from './BaseEmissionFormatter';

/**
 * PowerShell-specific emission formatter.
 * Converts shell-agnostic emissions to PowerShell syntax.
 */
export class PowerShellEmissionFormatter extends BaseEmissionFormatter implements IEmissionFormatter {
  readonly fileExtension: string = '.ps1';

  formatEmission(emission: Emission): string {
    if (isEnvironmentEmission(emission)) {
      return this.formatEnvironment(emission);
    }
    if (isAliasEmission(emission)) {
      return this.formatAlias(emission);
    }
    if (isFunctionEmission(emission)) {
      return this.formatFunction(emission);
    }
    if (isScriptEmission(emission)) {
      return this.formatScript(emission);
    }
    if (isSourceEmission(emission)) {
      return this.formatSource(emission);
    }
    if (isSourceFileEmission(emission)) {
      return this.formatSourceFile(emission);
    }
    if (isSourceFunctionEmission(emission)) {
      return this.formatSourceFunction(emission);
    }
    if (isCompletionEmission(emission)) {
      return this.formatCompletion(emission);
    }
    if (isPathEmission(emission)) {
      return this.formatPath(emission);
    }
    throw new Error(`Unknown emission kind: ${(emission as Emission).kind}`);
  }

  formatOnceScript(emission: ScriptEmission, index: number): OnceScriptContent {
    if (!this.onceScriptDir) {
      throw new Error('onceScriptDir is required for once scripts');
    }

    const paddedIndex = index.toString().padStart(ONCE_SCRIPT_INDEX_PAD_LENGTH, '0');
    const filename = `once-${paddedIndex}.ps1`;
    const outputPath = `${this.onceScriptDir}/${filename}`;
    const scriptContent = dedentString(emission.content);

    const content = this.generateOnceScriptContent(scriptContent, outputPath);

    return { content, filename };
  }

  formatOnceScriptInitializer(): string {
    if (!this.onceScriptDir) {
      throw new Error('onceScriptDir is required for once script initializer');
    }

    return dedentString(`
      # Execute once scripts (runs only once per script)
      Get-ChildItem -Path "${this.onceScriptDir}/*.ps1" -ErrorAction SilentlyContinue | ForEach-Object {
        if (Test-Path $_.FullName) {
          & $_.FullName
        }
      }
    `);
  }

  private formatEnvironment(emission: EnvironmentEmission): string {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(emission.variables)) {
      lines.push(`$env:${key} = ${JSON.stringify(value)}`);
    }
    return lines.join('\n');
  }

  private formatAlias(emission: AliasEmission): string {
    const lines: string[] = [];
    for (const [name, command] of Object.entries(emission.aliases)) {
      lines.push(`Set-Alias -Name ${name} -Value '${command.replace(/'/g, "''")}'`);
    }
    return lines.join('\n');
  }

  private formatFunction(emission: FunctionEmission): string {
    const body = dedentString(emission.body);
    const indent = ' '.repeat(this.indentSize);

    const indentedBody = body.split('\n').map((line) => `${indent}${line}`).join('\n');
    return [
      `function ${emission.name} {`,
      indentedBody,
      `}`,
    ].join('\n');
  }

  private formatScript(emission: ScriptEmission): string {
    const content = dedentString(emission.content);
    return content;
  }

  private formatSourceFile(emission: SourceFileEmission): string {
    return `. "${emission.path}"`;
  }

  /**
   * Formats a source emission with inline content.
   * Creates a temporary function, invokes its output, and cleans up.
   */
  private formatSource(emission: SourceEmission): string {
    const content = dedentString(emission.content);
    const functionName = emission.functionName;
    const indent = ' '.repeat(this.indentSize);

    const indentedContent = content.split('\n').map((line) => `${indent}${line}`).join('\n');
    return [
      `function ${functionName} {`,
      indentedContent,
      `}`,
      `Invoke-Expression (& ${functionName})`,
      `Remove-Item Function:\\${functionName} -ErrorAction SilentlyContinue`,
    ].join('\n');
  }

  private formatSourceFunction(emission: SourceFunctionEmission): string {
    // In PowerShell, we invoke the function and evaluate the result
    return `Invoke-Expression (& ${emission.functionName})`;
  }

  private formatCompletion(emission: CompletionEmission): string {
    const lines: string[] = [];

    // Source specific completion files with existence check
    if (emission.files) {
      for (const file of emission.files) {
        lines.push(`if (Test-Path "${file}") { . "${file}" }`);
      }
    }

    // PowerShell completions are handled differently - typically via modules
    // Directory-based completion loading is less common

    return lines.join('\n');
  }

  private formatPath(emission: PathEmission): string {
    const dir = emission.directory;

    if (emission.deduplicate) {
      if (emission.position === 'prepend') {
        return `if ($env:PATH -notlike "*${dir}*") { $env:PATH = "${dir};$env:PATH" }`;
      }
      return `if ($env:PATH -notlike "*${dir}*") { $env:PATH = "$env:PATH;${dir}" }`;
    }

    if (emission.position === 'prepend') {
      return `$env:PATH = "${dir};$env:PATH"`;
    }
    return `$env:PATH = "$env:PATH;${dir}"`;
  }

  private generateOnceScriptContent(
    scriptContent: string,
    outputPath: string,
  ): string {
    const lines = ['# Generated once script - will self-delete after execution'];
    lines.push(scriptContent);
    lines.push(`Remove-Item "${outputPath}"`);
    return lines.join('\n');
  }
}
