import type { ShellType, IShellTypeConfig, ToolConfig } from "@dotfiles/core";
import path from "node:path";
import { BaseShellGenerator } from "./BaseShellGenerator";

/**
 * PowerShell-specific shell initialization generator.
 * Handles PowerShell syntax and conventions for PATH, environment variables,
 * completions, and tool-specific initialization.
 */
export class PowerShellGenerator extends BaseShellGenerator {
  readonly shellType: ShellType = "powershell";
  readonly fileExtension: string = ".ps1";

  protected getShellConfig(toolConfig: ToolConfig): IShellTypeConfig | undefined {
    // ShellTypeConfig is manually typed; ToolConfig uses Zod inference with z.unknown() for completions
    return toolConfig.shellConfigs?.powershell as IShellTypeConfig | undefined;
  }

  protected getCompletionDir(): string {
    return path.join(this.projectConfig.paths.shellScriptsDir, "powershell", "completions");
  }
}
