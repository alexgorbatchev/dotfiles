import { createShell, type IInstallContext, type IInstallOptions, type Shell } from "@dotfiles/core";
import { getBinaryPaths, withInstallErrorHandling } from "@dotfiles/installer";
import type { TsLogger } from "@dotfiles/logger";
import { detectVersionViaCli, normalizeVersion } from "@dotfiles/utils";
import path from "node:path";
import { messages } from "./log-messages";
import type { NpmToolConfig } from "./schemas";
import type { INpmInstallMetadata, NpmInstallResult } from "./types";

/**
 * Installs a tool using npm/bun globally.
 *
 * This function handles the complete installation process for npm tools:
 * 1. Installs the npm package globally using `npm install -g` or `bun install -g`
 * 2. Resolves the global bin directory to find where binaries land
 * 3. Retrieves version information from the installed package
 * 4. Determines binary paths from the global bin directory
 */
export async function installFromNpm(
  toolName: string,
  toolConfig: NpmToolConfig,
  _context: IInstallContext,
  _options: IInstallOptions | undefined,
  parentLogger: TsLogger,
  shellExecutor: Shell,
  installShell?: Shell,
): Promise<NpmInstallResult> {
  const logger = parentLogger.getSubLogger({ name: "installFromNpm" });

  if (!toolConfig.installParams) {
    return {
      success: false,
      error: "Install parameters not specified",
    };
  }

  const params = toolConfig.installParams;
  const packageName: string = params.package || toolName;
  const packageVersion: string | undefined = params.version;
  const packageSpec: string = packageVersion ? `${packageName}@${packageVersion}` : packageName;

  logger.debug(messages.installing(packageName));

  const isBun = params.packageManager === "bun";

  const operation = async (): Promise<NpmInstallResult> => {
    const loggingShell = installShell ?? createShell({ logger, skipCommandLog: true });

    if (isBun) {
      await executeBunGlobalInstall(packageSpec, logger, loggingShell);
    } else {
      await executeNpmGlobalInstall(packageSpec, logger, loggingShell);
    }

    const globalBinDir: string = await getGlobalBinDir(isBun, loggingShell);
    const binaryPaths: string[] = getBinaryPaths(toolConfig.binaries, globalBinDir);

    let version: string | undefined;

    if (params.versionArgs && params.versionRegex) {
      const mainBinaryPath = binaryPaths[0];
      if (mainBinaryPath) {
        version = await detectVersionViaCli({
          binaryPath: mainBinaryPath,
          args: params.versionArgs,
          regex: params.versionRegex,
          shellExecutor,
        });
      }
    } else if (isBun) {
      const mainBinaryPath = binaryPaths[0];
      if (mainBinaryPath) {
        version = await detectVersionViaCli({
          binaryPath: mainBinaryPath,
          args: ["--version"],
          regex: "(\\d+\\.\\d+\\.\\d+)",
          shellExecutor,
        });
      }
    } else {
      version = await getNpmViewVersion(packageName, shellExecutor);
    }

    const metadata: INpmInstallMetadata = {
      method: "npm",
      packageName,
    };

    const result: NpmInstallResult = {
      success: true,
      binaryPaths,
      version: version ? normalizeVersion(version) : undefined,
      metadata,
    };

    return result;
  };

  return withInstallErrorHandling("npm", toolName, logger, operation);
}

/**
 * Returns the global bin directory for the given package manager.
 *
 * - bun: runs `bun pm bin -g` (e.g. `~/.bun/bin`)
 * - npm: runs `npm prefix -g` + `/bin` (e.g. `/usr/local/bin`)
 */
async function getGlobalBinDir(isBun: boolean, shell: Shell): Promise<string> {
  if (isBun) {
    const result = await shell`bun pm bin -g`.quiet();
    return result.stdout.toString().trim();
  }

  const result = await shell`npm prefix -g`.quiet();
  return path.join(result.stdout.toString().trim(), "bin");
}

/**
 * Executes `bun install -g` to install a package globally.
 */
async function executeBunGlobalInstall(packageSpec: string, logger: TsLogger, shell: Shell): Promise<void> {
  const command = `bun install -g ${packageSpec}`;
  logger.debug(messages.executingCommand(command));
  await shell`bun install -g ${packageSpec}`;
}

/**
 * Executes `npm install -g` to install a package globally.
 */
async function executeNpmGlobalInstall(packageSpec: string, logger: TsLogger, shell: Shell): Promise<void> {
  const command = `npm install -g ${packageSpec}`;
  logger.debug(messages.executingCommand(command));
  await shell`npm install -g ${packageSpec}`;
}

/**
 * Retrieves the version of an npm package via `npm view`.
 */
async function getNpmViewVersion(packageName: string, shell: Shell): Promise<string | undefined> {
  try {
    const result = await shell`npm view ${packageName} version`.quiet().noThrow();
    const version: string = result.stdout.toString().trim();
    return version || undefined;
  } catch {
    return undefined;
  }
}
