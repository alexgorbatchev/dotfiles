import { createShell, type IInstallContext, type IInstallOptions, type IShell } from "@dotfiles/core";
import { normalizeBinaries, runWithSudo, withInstallErrorHandling } from "@dotfiles/installer";
import type { TsLogger } from "@dotfiles/logger";
import { normalizeVersion } from "@dotfiles/utils";
import { messages } from "./log-messages";
import type { IPacmanInstallParams, PacmanToolConfig } from "./schemas";
import type { IPacmanInstallMetadata, PacmanInstallResult } from "./types";

export async function installFromPacman(
  toolName: string,
  toolConfig: PacmanToolConfig,
  context: IInstallContext,
  _options: IInstallOptions | undefined,
  parentLogger: TsLogger,
  shellExecutor: IShell,
  installShell?: IShell,
): Promise<PacmanInstallResult> {
  const logger = parentLogger.getSubLogger({ name: "installFromPacman" });
  const params: IPacmanInstallParams = toolConfig.installParams;
  const packageName: string = params.package ?? toolName;
  const localPackageName: string = getLocalPackageName(packageName);
  logger.debug(messages.installing(packageName));

  const operation = async (): Promise<PacmanInstallResult> => {
    const loggingShell = installShell ?? createShell({ logger, skipCommandLog: true });
    await executePacmanInstall(toolName, packageName, params, toolConfig.sudo, context, logger, loggingShell);

    const binaryPaths: string[] = await resolveBinaryPaths(toolConfig, shellExecutor, logger);
    const version: string | undefined =
      params.version ??
      (await getInstalledVersion(localPackageName, shellExecutor, logger)) ??
      (toolConfig.version !== "latest" ? toolConfig.version : undefined);

    const metadata: IPacmanInstallMetadata = {
      method: "pacman",
      packageName,
    };

    return {
      success: true,
      binaryPaths,
      version: version ? normalizeVersion(version) : undefined,
      metadata,
    };
  };

  return withInstallErrorHandling("pacman", toolName, logger, operation);
}

function getLocalPackageName(packageName: string): string {
  const separatorIndex: number = packageName.lastIndexOf("/");
  if (separatorIndex < 0) {
    return packageName;
  }

  return packageName.slice(separatorIndex + 1);
}

async function executePacmanInstall(
  toolName: string,
  packageName: string,
  params: IPacmanInstallParams,
  shouldUseSudo: boolean | undefined,
  context: IInstallContext,
  logger: TsLogger,
  shell: IShell,
): Promise<void> {
  const packageSpec: string = params.version ? `${packageName}=${params.version}` : packageName;
  const syncArgs: string = params.sysupgrade ? "-Syu" : "-S";
  const command: string = `pacman ${syncArgs} --needed --noconfirm ${packageSpec}`;

  logger.info(messages.executingCommand(command));
  if (shouldUseSudo) {
    await runWithSudo(toolName, context, {
      command: ["pacman", syncArgs, "--needed", "--noconfirm", packageSpec],
      failureLabel: "sudo pacman install",
    });
    return;
  }

  await shell`pacman ${syncArgs} --needed --noconfirm ${packageSpec}`;
}

async function resolveBinaryPaths(toolConfig: PacmanToolConfig, shell: IShell, logger: TsLogger): Promise<string[]> {
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
    const result = await shell`pacman -Q ${packageName}`.quiet().noThrow();
    const output: string = result.stdout.toString().trim();
    const packagePrefix = `${packageName} `;

    if (output.startsWith(packagePrefix)) {
      const version: string = output.slice(packagePrefix.length).trim();
      return version || undefined;
    }

    return undefined;
  } catch (error) {
    logger.debug(messages.versionFetchFailed(packageName), error);
    return undefined;
  }
}
