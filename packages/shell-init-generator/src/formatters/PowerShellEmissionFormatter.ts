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

    const content = this.generateOnceScriptContent(scriptContent, outputPath, emission.homeOverride);

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
      lines.push(`Set-Alias -Name ${name} -Value ${JSON.stringify(command)}`);
    }
    return lines.join('\n');
  }

  private formatFunction(emission: FunctionEmission): string {
    const body = dedentString(emission.body);
    const indent = ' '.repeat(this.indentSize);

    if (emission.homeOverride) {
      const indentedBody = body.split('\n').map((line) => `${indent}${indent}${line}`).join('\n');
      return [
        `function ${emission.name} {`,
        `${indent}$homeOrig = $env:HOME`,
        `${indent}$userProfileOrig = $env:USERPROFILE`,
        `${indent}try {`,
        `${indent}${indent}$env:HOME = "${this.homeDir}"`,
        `${indent}${indent}$env:USERPROFILE = "${this.homeDir}"`,
        indentedBody,
        `${indent}} finally {`,
        `${indent}${indent}$env:HOME = $homeOrig`,
        `${indent}${indent}$env:USERPROFILE = $userProfileOrig`,
        `${indent}${indent}Remove-Variable -Name 'homeOrig' -ErrorAction SilentlyContinue`,
        `${indent}${indent}Remove-Variable -Name 'userProfileOrig' -ErrorAction SilentlyContinue`,
        `${indent}}`,
        `}`,
      ].join('\n');
    }

    const indentedBody = body.split('\n').map((line) => `${indent}${line}`).join('\n');
    return [
      `function ${emission.name} {`,
      indentedBody,
      `}`,
    ].join('\n');
  }

  private formatScript(emission: ScriptEmission): string {
    const content = dedentString(emission.content);

    if (emission.timing === 'raw') {
      return content;
    }

    if (emission.homeOverride) {
      const indent = ' '.repeat(this.indentSize);
      const indentedContent = content.split('\n').map((line) => `${indent}${line}`).join('\n');
      return [
        '$homeOrig = $env:HOME',
        '$userProfileOrig = $env:USERPROFILE',
        'try {',
        `${indent}$env:HOME = "${this.homeDir}"`,
        `${indent}$env:USERPROFILE = "${this.homeDir}"`,
        indentedContent,
        '} finally {',
        `${indent}$env:HOME = $homeOrig`,
        `${indent}$env:USERPROFILE = $userProfileOrig`,
        `${indent}Remove-Variable -Name 'homeOrig' -ErrorAction SilentlyContinue`,
        `${indent}Remove-Variable -Name 'userProfileOrig' -ErrorAction SilentlyContinue`,
        '}',
      ].join('\n');
    }

    return content;
  }

  private formatSourceFile(emission: SourceFileEmission): string {
    if (emission.homeOverride) {
      const indent = ' '.repeat(this.indentSize);
      return [
        `# Source ${emission.path} with HOME override`,
        '$homeOrig = $env:HOME',
        '$userProfileOrig = $env:USERPROFILE',
        'try {',
        `${indent}$env:HOME = "${this.homeDir}"`,
        `${indent}$env:USERPROFILE = "${this.homeDir}"`,
        `${indent}. "${emission.path}"`,
        '} finally {',
        `${indent}$env:HOME = $homeOrig`,
        `${indent}$env:USERPROFILE = $userProfileOrig`,
        `${indent}Remove-Variable -Name 'homeOrig' -ErrorAction SilentlyContinue`,
        `${indent}Remove-Variable -Name 'userProfileOrig' -ErrorAction SilentlyContinue`,
        '}',
      ].join('\n');
    }

    return `. "${emission.path}"`;
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
    homeOverride?: boolean,
  ): string {
    const lines = ['# Generated once script - will self-delete after execution'];
    const indent = ' '.repeat(this.indentSize);

    if (homeOverride) {
      const indentedContent = scriptContent.split('\n').map((line) => `${indent}${line}`).join('\n');
      lines.push('$homeOrig = $env:HOME');
      lines.push('$userProfileOrig = $env:USERPROFILE');
      lines.push('try {');
      lines.push(`${indent}$env:HOME = "${this.homeDir}"`);
      lines.push(`${indent}$env:USERPROFILE = "${this.homeDir}"`);
      lines.push(indentedContent);
      lines.push('} finally {');
      lines.push(`${indent}$env:HOME = $homeOrig`);
      lines.push(`${indent}$env:USERPROFILE = $userProfileOrig`);
      lines.push(`${indent}Remove-Variable -Name 'homeOrig' -ErrorAction SilentlyContinue`);
      lines.push(`${indent}Remove-Variable -Name 'userProfileOrig' -ErrorAction SilentlyContinue`);
      lines.push('}');
    } else {
      lines.push(scriptContent);
    }

    lines.push(`Remove-Item "${outputPath}"`);
    return lines.join('\n');
  }
}
