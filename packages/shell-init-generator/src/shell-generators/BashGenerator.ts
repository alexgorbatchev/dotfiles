import type { ShellType, IShellTypeConfig, ToolConfig } from "@dotfiles/core";
import path from "node:path";
import { BaseShellGenerator } from "./BaseShellGenerator";

/**
 * Bash-specific shell initialization generator.
 * Handles Bash syntax and conventions for PATH, environment variables,
 * completions, and tool-specific initialization.
 */
export class BashGenerator extends BaseShellGenerator {
  readonly shellType: ShellType = "bash";
  readonly fileExtension: string = ".bash";

  protected getShellConfig(toolConfig: ToolConfig): IShellTypeConfig | undefined {
    // ShellTypeConfig is manually typed; ToolConfig uses Zod inference with z.unknown() for completions
    return toolConfig.shellConfigs?.bash as IShellTypeConfig | undefined;
  }

  protected getCompletionDir(): string {
    return path.join(this.projectConfig.paths.shellScriptsDir, "bash", "completions");
  }
}
