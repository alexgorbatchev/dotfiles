import { createShell, type IInstallContext, type IInstallOptions, type IShell } from "@dotfiles/core";
import { normalizeBinaries, runWithSudo, withInstallErrorHandling } from "@dotfiles/installer";
import type { TsLogger } from "@dotfiles/logger";
import { normalizeVersion } from "@dotfiles/utils";
import { messages } from "./log-messages";
import type { AptToolConfig, IAptInstallParams } from "./schemas";
import type { AptInstallResult, IAptInstallMetadata } from "./types";

export async function installFromApt(
  toolName: string,
  toolConfig: AptToolConfig,
  context: IInstallContext,
  _options: IInstallOptions | undefined,
  parentLogger: TsLogger,
  shellExecutor: IShell,
  installShell?: IShell,
): Promise<AptInstallResult> {
  const logger = parentLogger.getSubLogger({ name: "installFromApt" });
  const params: IAptInstallParams = toolConfig.installParams;
  const packageName: string = params.package ?? toolName;
  logger.debug(messages.installing(packageName));

  const operation = async (): Promise<AptInstallResult> => {
    const loggingShell = installShell ?? createShell({ logger, skipCommandLog: true });
    await executeAptInstall(toolName, packageName, params, toolConfig.sudo, context, logger, loggingShell);

    const binaryPaths: string[] = await resolveBinaryPaths(toolConfig, shellExecutor, logger);
    const version: string | undefined =
      (await getInstalledVersion(packageName, shellExecutor, logger)) ??
      (toolConfig.version !== "latest" ? toolConfig.version : undefined);

    const metadata: IAptInstallMetadata = {
      method: "apt",
      packageName,
    };

    return {
      success: true,
      binaryPaths,
      version: version ? normalizeVersion(version) : undefined,
      metadata,
    };
  };

  return withInstallErrorHandling("apt", toolName, logger, operation);
}

async function executeAptInstall(
  toolName: string,
  packageName: string,
  params: IAptInstallParams,
  shouldUseSudo: boolean | undefined,
  context: IInstallContext,
  logger: TsLogger,
  shell: IShell,
): Promise<void> {
  const packageSpec: string = params.version ? `${packageName}=${params.version}` : packageName;

  if (params.update) {
    logger.info(messages.executingCommand("apt-get update"));
    if (shouldUseSudo) {
      await runWithSudo(toolName, context, { command: ["apt-get", "update"], failureLabel: "sudo apt-get update" });
    } else {
      await shell`apt-get update`;
    }
  }

  logger.info(messages.executingCommand(`apt-get install -y ${packageSpec}`));
  if (shouldUseSudo) {
    await runWithSudo(toolName, context, {
      command: ["apt-get", "install", "-y", packageSpec],
      failureLabel: "sudo apt-get install",
    });
    return;
  }

  await shell`apt-get install -y ${packageSpec}`;
}

async function resolveBinaryPaths(toolConfig: AptToolConfig, shell: IShell, logger: TsLogger): Promise<string[]> {
  const binaries = normalizeBinaries(toolConfig.binaries);
  const binaryPaths: string[] = [];

  for (const binary of binaries) {
    try {
      const commandResult = await shell`command -v ${binary.name}`.quiet();
      const resolvedPath: string = commandResult.stdout.toString().trim();
      if (resolvedPath) {
        binaryPaths.push(resolvedPath);
      } else {
        logger.warn(messages.binaryNotFound(binary.name));
      }
    } catch {
      logger.warn(messages.binaryNotFound(binary.name));
    }
  }

  return binaryPaths;
}

async function getInstalledVersion(packageName: string, shell: IShell, logger: TsLogger): Promise<string | undefined> {
  try {
    const format = "${Version}";
    const result = await shell`dpkg-query -W -f=${format} ${packageName}`.quiet().noThrow();
    const version: string = result.stdout.toString().trim();
    return version || undefined;
  } catch (error) {
    logger.debug(messages.versionFetchFailed(packageName), error);
    return undefined;
  }
}
