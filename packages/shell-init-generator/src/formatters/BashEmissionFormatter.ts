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
 * Bash-specific emission formatter.
 * Converts shell-agnostic emissions to Bash syntax.
 */
export class BashEmissionFormatter extends BasePosixEmissionFormatter implements IEmissionFormatter {
  readonly fileExtension: string = ".bash";

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
    const filename = `once-${paddedIndex}.bash`;
    const outputPath = `${this.onceScriptDir}/${filename}`;
    const scriptContent = dedentString(emission.content);

    const content = this.generateOnceScriptContent(scriptContent, outputPath, emission.source);

    return { content, filename };
  }

  formatOnceScriptInitializer(): string {
    if (!this.onceScriptDir) {
      throw new Error("onceScriptDir is required for once script initializer");
    }

    return dedentString(`
      # Execute once scripts (runs only once per script)
      shopt -s nullglob
      for once_script in "${this.onceScriptDir}"/*.bash; do
        [[ -f "$once_script" ]] && source "$once_script"
      done
      shopt -u nullglob
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

    // Source specific completion files with existence check
    if (emission.files) {
      for (const file of emission.files) {
        lines.push(`[[ -f "${file}" ]] && source "${file}"`);
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
