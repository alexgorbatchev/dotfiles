import { createShell, type IInstallContext, type IInstallOptions, type IShell } from "@dotfiles/core";
import { getBinaryPaths, withInstallErrorHandling } from "@dotfiles/installer";
import type { TsLogger } from "@dotfiles/logger";
import { normalizeVersion } from "@dotfiles/utils";
import path from "node:path";
import { z } from "zod";
import { messages } from "./log-messages";
import type { NpmToolConfig } from "./schemas";
import type { INpmInstallMetadata, NpmInstallResult } from "./types";

const npmInstalledPackageSchema = z
  .object({
    version: z.string(),
  })
  .passthrough();

const npmInstalledPackagesSchema = z
  .object({
    dependencies: z.record(z.string(), npmInstalledPackageSchema).optional(),
  })
  .passthrough();

/**
 * Installs a tool using npm/bun globally.
 *
 * This function handles the complete installation process for npm tools:
 * 1. Installs the npm package globally using `npm install -g` or `bun install -g`
 * 2. Resolves the global bin directory to find where binaries land
 * 3. Retrieves version information from the package manager
 * 4. Determines binary paths from the global bin directory
 */
export async function installFromNpm(
  toolName: string,
  toolConfig: NpmToolConfig,
  _context: IInstallContext,
  _options: IInstallOptions | undefined,
  parentLogger: TsLogger,
  shellExecutor: IShell,
  installShell?: IShell,
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
    const version: string | undefined = isBun
      ? await getBunInstalledVersion(packageName, shellExecutor)
      : await getNpmInstalledVersion(packageName, shellExecutor);

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
async function getGlobalBinDir(isBun: boolean, shell: IShell): Promise<string> {
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
async function executeBunGlobalInstall(packageSpec: string, logger: TsLogger, shell: IShell): Promise<void> {
  const command = `bun install -g ${packageSpec}`;
  logger.debug(messages.executingCommand(command));
  await shell`bun install -g ${packageSpec}`;
}

/**
 * Executes `npm install -g` to install a package globally.
 */
async function executeNpmGlobalInstall(packageSpec: string, logger: TsLogger, shell: IShell): Promise<void> {
  const command = `npm install -g ${packageSpec}`;
  logger.debug(messages.executingCommand(command));
  await shell`npm install -g ${packageSpec}`;
}

/**
 * Retrieves the installed version of an npm package via `npm ls`.
 */
async function getNpmInstalledVersion(packageName: string, shell: IShell): Promise<string | undefined> {
  try {
    const result = await shell`npm ls -g --depth=0 --json ${packageName}`.quiet().noThrow();
    const output: string = result.stdout.toString().trim();

    if (!output) {
      return undefined;
    }

    const parsedOutput: unknown = JSON.parse(output);
    const parsedResult = npmInstalledPackagesSchema.safeParse(parsedOutput);

    if (!parsedResult.success) {
      return undefined;
    }

    return parsedResult.data.dependencies?.[packageName]?.version;
  } catch {
    return undefined;
  }
}

/**
 * Retrieves the installed version of a Bun global package via `bun pm ls -g`.
 */
async function getBunInstalledVersion(packageName: string, shell: IShell): Promise<string | undefined> {
  try {
    const result = await shell`bun pm ls -g`.quiet().noThrow();
    const output: string = result.stdout.toString().trim();

    return parseBunInstalledVersion(output, packageName);
  } catch {
    return undefined;
  }
}

function parseBunInstalledVersion(output: string, packageName: string): string | undefined {
  const lines: string[] = output.split(/\r?\n/u);

  for (const line of lines) {
    const packageEntry: string = line.replace(/^[\s│]*[├└]──\s+/u, "").trim();
    const version: string | undefined = getPackageEntryVersion(packageEntry, packageName);

    if (version) {
      return version;
    }
  }

  return undefined;
}

function getPackageEntryVersion(packageEntry: string, packageName: string): string | undefined {
  const packagePrefix = `${packageName}@`;

  if (!packageEntry.startsWith(packagePrefix)) {
    return undefined;
  }

  const version: string = packageEntry.slice(packagePrefix.length).trim();
  return version || undefined;
}
