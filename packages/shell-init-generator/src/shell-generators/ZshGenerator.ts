import type { ShellCompletionConfig, ShellType, IShellTypeConfig, ToolConfig } from "@dotfiles/core";
import type { Emission } from "@dotfiles/shell-emissions";
import { completion } from "@dotfiles/shell-emissions";
import path from "node:path";
import { BaseShellGenerator } from "./BaseShellGenerator";

/**
 * Zsh-specific shell initialization generator.
 * Handles Zsh syntax and conventions for PATH, environment variables,
 * completions, and tool-specific initialization.
 */
export class ZshGenerator extends BaseShellGenerator {
  readonly shellType: ShellType = "zsh";
  readonly fileExtension: string = ".zsh";

  protected getShellConfig(toolConfig: ToolConfig): IShellTypeConfig | undefined {
    // ShellTypeConfig is manually typed; ToolConfig uses Zod inference with z.unknown() for completions
    return toolConfig.shellConfigs?.zsh as IShellTypeConfig | undefined;
  }

  protected getCompletionDir(): string {
    return path.join(this.projectConfig.paths.shellScriptsDir, "zsh", "completions");
  }

  /**
   * Zsh uses fpath directories for completions.
   */
  protected override createCompletionEmission(config: ShellCompletionConfig): Emission | undefined {
    const completionDir = this.getCompletionDir();

    if (config.cmd || config.source) {
      return completion({
        directories: [completionDir],
      });
    }

    return undefined;
  }
}
