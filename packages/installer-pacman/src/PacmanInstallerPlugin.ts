import type {
  IInstallContext,
  IInstallerPlugin,
  IInstallOptions,
  InstallResult,
  IValidationResult,
  IShell,
} from "@dotfiles/core";
import { Platform } from "@dotfiles/core";
import type { TsLogger } from "@dotfiles/logger";
import { installFromPacman } from "./installFromPacman";
import {
  type IPacmanInstallParams,
  pacmanInstallParamsSchema,
  type PacmanToolConfig,
  pacmanToolConfigSchema,
} from "./schemas";
import type { IPacmanInstallMetadata } from "./types";

const PLUGIN_VERSION = "1.0.0";

export class PacmanInstallerPlugin implements IInstallerPlugin<
  "pacman",
  IPacmanInstallParams,
  PacmanToolConfig,
  IPacmanInstallMetadata
> {
  readonly method = "pacman";
  readonly displayName = "pacman Installer";
  readonly version = PLUGIN_VERSION;
  readonly paramsSchema = pacmanInstallParamsSchema;
  readonly toolConfigSchema = pacmanToolConfigSchema;
  readonly staticValidation = true;
  readonly externallyManaged = true;

  constructor(private readonly shell: IShell) {}

  async validate(context: IInstallContext): Promise<IValidationResult> {
    if (context.systemInfo.platform !== Platform.Linux) {
      return { valid: false, errors: ["pacman installer only works on Linux"] };
    }

    try {
      await this.shell`command -v pacman`.quiet();
      return { valid: true };
    } catch {
      return { valid: false, errors: ["pacman is required for pacman installation"] };
    }
  }

  async install(
    toolName: string,
    toolConfig: PacmanToolConfig,
    context: IInstallContext,
    options: IInstallOptions | undefined,
    logger: TsLogger,
  ): Promise<InstallResult<IPacmanInstallMetadata>> {
    return installFromPacman(toolName, toolConfig, context, options, logger, this.shell, this.shell);
  }

  supportsUpdate(): boolean {
    return true;
  }

  supportsSudo(): boolean {
    return true;
  }

  supportsUpdateCheck(): boolean {
    return false;
  }

  supportsReadme(): boolean {
    return false;
  }
}
