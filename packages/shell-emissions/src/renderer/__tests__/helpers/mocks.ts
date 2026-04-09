import type {
  IBlock,
  IBlockMetadata,
  Emission,
  IEmissionFormatter,
  IOnceScriptContent,
  IScriptEmission,
} from "../../../types";

/**
 * Mock formatter for testing that produces predictable output.
 */
export class MockFormatter implements IEmissionFormatter {
  readonly fileExtension = ".mock";

  formatEmission(emission: Emission): string {
    switch (emission.kind) {
      case "environment": {
        return Object.entries(emission.variables)
          .map(([key, value]) => `export ${key}="${value}"`)
          .join("\n");
      }
      case "alias": {
        return Object.entries(emission.aliases)
          .map(([name, command]) => `alias ${name}="${command}"`)
          .join("\n");
      }
      case "function": {
        return `${emission.name}() {\n  ${emission.body}\n}`;
      }
      case "script": {
        return emission.content;
      }
      case "source": {
        return `${emission.functionName}() {\n  ${emission.content}\n}\nsource <(${emission.functionName})\nunset -f ${emission.functionName}`;
      }
      case "sourceFile": {
        return `source "${emission.path}"`;
      }
      case "sourceFunction": {
        return `source <(${emission.functionName})`;
      }
      case "completion": {
        const parts: string[] = [];
        if (emission.directories) {
          parts.push(`fpath=(${emission.directories.join(" ")} $fpath)`);
        }
        if (emission.files) {
          parts.push(...emission.files.map((f) => `source "${f}"`));
        }
        if (emission.commands) {
          parts.push(`autoload -Uz compinit && compinit`);
        }
        return parts.join("\n");
      }
      case "path": {
        const dir = emission.directory;
        if (emission.deduplicate) {
          if (emission.position === "prepend") {
            return `[[ ":$PATH:" != *":${dir}:"* ]] && export PATH="${dir}:$PATH"`;
          }
          return `[[ ":$PATH:" != *":${dir}:"* ]] && export PATH="$PATH:${dir}"`;
        }
        if (emission.position === "prepend") {
          return `export PATH="${dir}:$PATH"`;
        }
        return `export PATH="$PATH:${dir}"`;
      }
    }
  }

  formatOnceScript(emission: IScriptEmission, index: number): IOnceScriptContent {
    const filename = emission.source
      ? `${emission.source.replace(/[/\s]/g, "-")}-${String(index).padStart(3, "0")}.mock`
      : `once-${String(index).padStart(3, "0")}.mock`;
    const content = `#!/bin/mock\n${emission.content}\nrm -f "$0"`;
    return { filename, content };
  }

  formatOnceScriptInitializer(): string {
    return `# Execute once scripts\nfor script in "$ONCE_DIR"/*.mock; do\n  [[ -x "$script" ]] && source "$script"\ndone`;
  }

  formatFileHeader(metadata?: IBlockMetadata): string {
    const lines = ["# AUTO-GENERATED FILE - DO NOT EDIT"];
    if (metadata?.description) {
      lines.push(`# ${metadata.description}`);
    }
    if (metadata?.generatedAt) {
      lines.push(`# Generated: ${metadata.generatedAt.toISOString()}`);
    }
    return lines.join("\n");
  }

  formatSectionHeader(title: string): string {
    return `# === ${title} ===`;
  }

  formatChildBlockHeader(block: IBlock): string {
    return `# --- ${block.title ?? block.id} ---`;
  }

  formatFileFooter(): string {
    return "# END OF FILE";
  }

  comment(text: string): string {
    return `# ${text}`;
  }

  commentBlock(lines: string[]): string {
    return lines.map((line) => `# ${line}`).join("\n");
  }
}
