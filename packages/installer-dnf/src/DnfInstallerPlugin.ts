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
import { installFromDnf } from "./installFromDnf";
import { type IDnfInstallParams, dnfInstallParamsSchema, type DnfToolConfig, dnfToolConfigSchema } from "./schemas";
import type { IDnfInstallMetadata } from "./types";

const PLUGIN_VERSION = "1.0.0";

export class DnfInstallerPlugin implements IInstallerPlugin<
  "dnf",
  IDnfInstallParams,
  DnfToolConfig,
  IDnfInstallMetadata
> {
  readonly method = "dnf";
  readonly displayName = "DNF Installer";
  readonly version = PLUGIN_VERSION;
  readonly paramsSchema = dnfInstallParamsSchema;
  readonly toolConfigSchema = dnfToolConfigSchema;
  readonly staticValidation = true;
  readonly externallyManaged = true;

  constructor(private readonly shell: IShell) {}

  async validate(context: IInstallContext): Promise<IValidationResult> {
    if (context.systemInfo.platform !== Platform.Linux) {
      return { valid: false, errors: ["DNF installer only works on Linux"] };
    }

    try {
      await this.shell`command -v dnf`.quiet();
      await this.shell`command -v rpm`.quiet();
      return { valid: true };
    } catch {
      return { valid: false, errors: ["dnf and rpm are required for DNF installation"] };
    }
  }

  async install(
    toolName: string,
    toolConfig: DnfToolConfig,
    context: IInstallContext,
    options: IInstallOptions | undefined,
    logger: TsLogger,
  ): Promise<InstallResult<IDnfInstallMetadata>> {
    return installFromDnf(toolName, toolConfig, context, options, logger, this.shell, this.shell);
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
