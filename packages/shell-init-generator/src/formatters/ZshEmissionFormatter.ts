import type {
  IAliasEmission,
  ICompletionEmission,
  Emission,
  IEnvironmentEmission,
  IFunctionEmission,
  IEmissionFormatter,
  IOnceScriptContent,
  IPathEmission,
  IScriptEmission,
  ISourceEmission,
  ISourceFileEmission,
  ISourceFunctionEmission,
} from "@dotfiles/shell-emissions";
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
} from "@dotfiles/shell-emissions";
import { dedentString } from "@dotfiles/utils";
import { BasePosixEmissionFormatter } from "./BasePosixEmissionFormatter";

/**
 * Zsh-specific emission formatter.
 * Converts shell-agnostic emissions to Zsh syntax.
 */
export class ZshEmissionFormatter extends BasePosixEmissionFormatter implements IEmissionFormatter {
  readonly fileExtension: string = ".zsh";

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

  formatOnceScript(emission: IScriptEmission, index: number): IOnceScriptContent {
    if (!this.onceScriptDir) {
      throw new Error("onceScriptDir is required for once scripts");
    }

    const paddedIndex = index.toString().padStart(ONCE_SCRIPT_INDEX_PAD_LENGTH, "0");
    const filename = `once-${paddedIndex}.zsh`;
    const outputPath = `${this.onceScriptDir}/${filename}`;
    const scriptContent = dedentString(emission.content);

    const content = this.generateOnceScriptContent(scriptContent, outputPath);

    return { content, filename };
  }

  formatOnceScriptInitializer(): string {
    if (!this.onceScriptDir) {
      throw new Error("onceScriptDir is required for once script initializer");
    }

    return dedentString(`
      # Execute once scripts (runs only once per script)
      for once_script in "${this.onceScriptDir}"/*.zsh(N); do
        [[ -f "$once_script" ]] && source "$once_script"
      done
    `);
  }

  private formatEnvironment(emission: IEnvironmentEmission): string {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(emission.variables)) {
      lines.push(`export ${key}=${JSON.stringify(value)}`);
    }
    return lines.join("\n");
  }

  private formatAlias(emission: IAliasEmission): string {
    const lines: string[] = [];
    for (const [name, command] of Object.entries(emission.aliases)) {
      lines.push(`alias ${name}='${command.replace(/'/g, "'\\''")}'`);
    }
    return lines.join("\n");
  }

  private formatFunction(emission: IFunctionEmission): string {
    const body = dedentString(emission.body);
    const indent = " ".repeat(this.indentSize);

    const indentedBody = body
      .split("\n")
      .map((line) => `${indent}${line}`)
      .join("\n");
    return [`${emission.name}() {`, indentedBody, `}`].join("\n");
  }

  private formatScript(emission: IScriptEmission): string {
    const content = dedentString(emission.content);
    return content;
  }

  private formatSourceFile(emission: ISourceFileEmission): string {
    return `source "${emission.path}"`;
  }

  /**
   * Formats a source emission with inline content.
   * Creates a temporary function, sources its output, and cleans up.
   */
  private formatSource(emission: ISourceEmission): string {
    const content = dedentString(emission.content);
    const functionName = emission.functionName;
    const indent = " ".repeat(this.indentSize);

    const indentedContent = content
      .split("\n")
      .map((line) => `${indent}${line}`)
      .join("\n");
    return [`${functionName}() {`, indentedContent, `}`, `source <(${functionName})`, `unset -f ${functionName}`].join(
      "\n",
    );
  }

  private formatSourceFunction(emission: ISourceFunctionEmission): string {
    return `source <(${emission.functionName})`;
  }

  private formatCompletion(emission: ICompletionEmission): string {
    const lines: string[] = [];

    // Ensure fpath is deduplicated (zsh-specific)
    lines.push("typeset -U fpath");

    // Add directories to fpath
    if (emission.directories) {
      for (const dir of emission.directories) {
        lines.push(`fpath=(${JSON.stringify(dir)} $fpath)`);
      }
    }

    // Source specific completion files
    if (emission.files) {
      for (const file of emission.files) {
        lines.push(`source "${file}"`);
      }
    }

    return lines.join("\n");
  }

  private formatPath(emission: IPathEmission): string {
    const dir = emission.directory;

    if (emission.deduplicate) {
      if (emission.position === "prepend") {
        return [`if [[ ":$PATH:" != *":${dir}:"* ]]; then`, `  export PATH="${dir}:$PATH"`, "fi"].join("\n");
      }
      return [`if [[ ":$PATH:" != *":${dir}:"* ]]; then`, `  export PATH="$PATH:${dir}"`, "fi"].join("\n");
    }

    if (emission.position === "prepend") {
      return `export PATH="${dir}:$PATH"`;
    }
    return `export PATH="$PATH:${dir}"`;
  }
}
