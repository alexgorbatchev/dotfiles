import type {
  BaseInstallContext,
  InstallerPlugin,
  InstallOptions,
  InstallResult,
  UpdateCheckResult,
} from '@dotfiles/core';
import type { TsLogger } from '@dotfiles/logger';
import { installFromBrew } from './installFromBrew';
import { messages } from './log-messages';
import { type BrewInstallParams, type BrewToolConfig, brewInstallParamsSchema, brewToolConfigSchema } from './schemas';

const PLUGIN_VERSION = '1.0.0';

type BrewPluginMetadata = {
  method: 'brew';
  formula: string;
  isCask: boolean;
  tap?: string | string[];
};

export class BrewInstallerPlugin
  implements InstallerPlugin<'brew', BrewInstallParams, BrewToolConfig, BrewPluginMetadata>
{
  readonly method = 'brew';
  readonly displayName = 'Homebrew Installer';
  readonly version = PLUGIN_VERSION;
  readonly paramsSchema = brewInstallParamsSchema;
  readonly toolConfigSchema = brewToolConfigSchema;

  constructor(private readonly logger: TsLogger) {}

  async install(
    toolName: string,
    toolConfig: BrewToolConfig,
    context: BaseInstallContext,
    options?: InstallOptions
  ): Promise<InstallResult<BrewPluginMetadata>> {
    const result = await installFromBrew(toolName, toolConfig, context, options, this.logger);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    const installResult: InstallResult<BrewPluginMetadata> = {
      success: true,
      binaryPaths: result.binaryPaths,
      version: result.version,
      metadata: result.metadata,
    };

    return installResult;
  }

  supportsUpdateCheck(): boolean {
    return true;
  }

  async checkUpdate(
    toolName: string,
    toolConfig: BrewToolConfig,
    _context: BaseInstallContext,
    logger: TsLogger
  ): Promise<UpdateCheckResult> {
    // TODO: Implement actual brew info check
    // For now, return a placeholder result
    logger.warn(messages.updateCheckNotImplemented(toolName));
    const result: UpdateCheckResult = {
      success: true,
      hasUpdate: false,
      currentVersion: toolConfig.version || 'latest',
    };
    return result;
  }

  supportsUpdate(): boolean {
    return false; // Not implemented yet
  }

  supportsReadme(): boolean {
    return false; // Brew formulas don't have direct README URLs
  }
}
