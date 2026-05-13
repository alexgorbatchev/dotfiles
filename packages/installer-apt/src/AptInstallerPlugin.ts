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
import { installFromApt } from "./installFromApt";
import { type IAptInstallParams, aptInstallParamsSchema, type AptToolConfig, aptToolConfigSchema } from "./schemas";
import type { IAptInstallMetadata } from "./types";

const PLUGIN_VERSION = "1.0.0";

export class AptInstallerPlugin implements IInstallerPlugin<
  "apt",
  IAptInstallParams,
  AptToolConfig,
  IAptInstallMetadata
> {
  readonly method = "apt";
  readonly displayName = "APT Installer";
  readonly version = PLUGIN_VERSION;
  readonly paramsSchema = aptInstallParamsSchema;
  readonly toolConfigSchema = aptToolConfigSchema;
  readonly staticValidation = true;
  readonly externallyManaged = true;

  constructor(private readonly shell: IShell) {}

  async validate(context: IInstallContext): Promise<IValidationResult> {
    if (context.systemInfo.platform !== Platform.Linux) {
      return { valid: false, errors: ["APT installer only works on Linux"] };
    }

    try {
      await this.shell`command -v apt-get`.quiet();
      await this.shell`command -v dpkg-query`.quiet();
      return { valid: true };
    } catch {
      return { valid: false, errors: ["apt-get and dpkg-query are required for APT installation"] };
    }
  }

  async install(
    toolName: string,
    toolConfig: AptToolConfig,
    context: IInstallContext,
    options: IInstallOptions | undefined,
    logger: TsLogger,
  ): Promise<InstallResult<IAptInstallMetadata>> {
    return installFromApt(toolName, toolConfig, context, options, logger, this.shell, this.shell);
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
