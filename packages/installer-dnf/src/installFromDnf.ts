import { createShell, type IInstallContext, type IInstallOptions, type IShell } from "@dotfiles/core";
import { normalizeBinaries, runWithSudo, withInstallErrorHandling } from "@dotfiles/installer";
import type { TsLogger } from "@dotfiles/logger";
import { normalizeVersion } from "@dotfiles/utils";
import { messages } from "./log-messages";
import type { DnfToolConfig, IDnfInstallParams } from "./schemas";
import type { DnfInstallResult, IDnfInstallMetadata } from "./types";

export async function installFromDnf(
  toolName: string,
  toolConfig: DnfToolConfig,
  context: IInstallContext,
  _options: IInstallOptions | undefined,
  parentLogger: TsLogger,
  shellExecutor: IShell,
  installShell?: IShell,
): Promise<DnfInstallResult> {
  const logger = parentLogger.getSubLogger({ name: "installFromDnf" });
  const params: IDnfInstallParams = toolConfig.installParams;
  const packageName: string = params.package ?? toolName;
  logger.debug(messages.installing(packageName));

  const operation = async (): Promise<DnfInstallResult> => {
    const loggingShell = installShell ?? createShell({ logger, skipCommandLog: true });
    await executeDnfInstall(toolName, packageName, params, toolConfig.sudo, context, logger, loggingShell);

    const binaryPaths: string[] = await resolveBinaryPaths(toolConfig, shellExecutor, logger);
    const version: string | undefined =
      params.version ??
      (await getInstalledVersion(packageName, shellExecutor, logger)) ??
      (toolConfig.version !== "latest" ? toolConfig.version : undefined);

    const metadata: IDnfInstallMetadata = {
      method: "dnf",
      packageName,
    };

    return {
      success: true,
      binaryPaths,
      version: version ? normalizeVersion(version) : undefined,
      metadata,
    };
  };

  return withInstallErrorHandling("dnf", toolName, logger, operation);
}

async function executeDnfInstall(
  toolName: string,
  packageName: string,
  params: IDnfInstallParams,
  shouldUseSudo: boolean | undefined,
  context: IInstallContext,
  logger: TsLogger,
  shell: IShell,
): Promise<void> {
  const packageSpec: string = params.version ? `${packageName}-${params.version}` : packageName;

  if (params.refresh) {
    logger.info(messages.executingCommand("dnf makecache"));
    if (shouldUseSudo) {
      await runWithSudo(toolName, context, { command: ["dnf", "makecache"], failureLabel: "sudo dnf makecache" });
    } else {
      await shell`dnf makecache`;
    }
  }

  logger.info(messages.executingCommand(`dnf install -y ${packageSpec}`));
  if (shouldUseSudo) {
    await runWithSudo(toolName, context, {
      command: ["dnf", "install", "-y", packageSpec],
      failureLabel: "sudo dnf install",
    });
    return;
  }

  await shell`dnf install -y ${packageSpec}`;
}

async function resolveBinaryPaths(toolConfig: DnfToolConfig, shell: IShell, logger: TsLogger): Promise<string[]> {
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
    const format = "%{VERSION}-%{RELEASE}";
    const result = await shell`rpm -q --qf ${format} ${packageName}`.quiet().noThrow();
    const version: string = result.stdout.toString().trim();
    return version || undefined;
  } catch (error) {
    logger.debug(messages.versionFetchFailed(packageName), error);
    return undefined;
  }
}
