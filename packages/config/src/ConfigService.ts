import type { ISystemInfo, ProjectConfig, ToolConfig } from "@dotfiles/core";
import type { IResolvedFileSystem } from "@dotfiles/file-system";
import type { TsLogger } from "@dotfiles/logger";
import type { IConfigService } from "./IConfigService";
import type { LoadToolConfigByBinaryResult } from "./types";
import {
  loadSingleToolConfig as actualLoadSingleToolConfig,
  loadToolConfigByBinary as actualLoadToolConfigByBinary,
  loadToolConfigs as actualLoadToolConfigs,
} from "./loadToolConfigs";

/**
 * Default implementation of {@link IConfigService} that delegates to the actual config loading functions.
 *
 * This service acts as a simple wrapper around the core configuration loading logic,
 * providing a clean interface for dependency injection in consuming code.
 */
export class ConfigService implements IConfigService {
  /**
   * @inheritdoc IConfigService.loadSingleToolConfig
   */
  async loadSingleToolConfig(
    logger: TsLogger,
    toolName: string,
    toolConfigsDir: string,
    fs: IResolvedFileSystem,
    projectConfig: ProjectConfig,
    systemInfo: ISystemInfo,
  ): Promise<ToolConfig | undefined> {
    return actualLoadSingleToolConfig(logger, toolName, toolConfigsDir, fs, projectConfig, systemInfo);
  }

  /**
   * @inheritdoc IConfigService.loadToolConfigByBinary
   */
  async loadToolConfigByBinary(
    logger: TsLogger,
    binaryName: string,
    toolConfigsDir: string,
    fs: IResolvedFileSystem,
    projectConfig: ProjectConfig,
    systemInfo: ISystemInfo,
  ): Promise<LoadToolConfigByBinaryResult> {
    return actualLoadToolConfigByBinary(logger, binaryName, toolConfigsDir, fs, projectConfig, systemInfo);
  }

  /**
   * @inheritdoc IConfigService.loadToolConfigs
   */
  async loadToolConfigs(
    logger: TsLogger,
    toolConfigsDir: string,
    fs: IResolvedFileSystem,
    projectConfig: ProjectConfig,
    systemInfo: ISystemInfo,
  ): Promise<Record<string, ToolConfig>> {
    return actualLoadToolConfigs(logger, toolConfigsDir, fs, projectConfig, systemInfo);
  }
}
