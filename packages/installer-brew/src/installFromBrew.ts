import { createLoggingShell, type IInstallContext, type IInstallOptions, type IShell } from "@dotfiles/core";
import { getBinaryPaths, withInstallErrorHandling } from "@dotfiles/installer";
import type { TsLogger } from "@dotfiles/logger";
import { detectVersionViaCli, normalizeVersion } from "@dotfiles/utils";
import { z } from "zod";
import { messages } from "./log-messages";
import type { BrewToolConfig } from "./schemas";
import type { BrewInstallResult, IBrewInstallMetadata } from "./types";

const BrewInfoSchema = z.object({
  name: z.string(),
  versions: z.object({
    stable: z.string(),
    head: z.string().optional(),
    bottle: z.boolean().optional(),
  }),
});

type BrewInfo = z.infer<typeof BrewInfoSchema>;
type BrewTapInput = string | string[] | undefined;
type BrewLinkInput = boolean | { force?: boolean; overwrite?: boolean } | undefined;
type BrewServiceInput = boolean | "start" | "run" | undefined;

/**
 * Installs a tool using Homebrew.
 *
 * This function handles the complete installation process for Homebrew tools:
 * 1. Taps custom repositories if specified
 * 2. Installs the formula or cask using `brew install`
 * 3. Retrieves version information via `brew info`
 * 4. Determines binary paths using the Homebrew prefix
 *
 * @param toolName - The name of the tool to install.
 * @param toolConfig - The configuration for the Homebrew tool.
 * @param context - The base installation context with project config and file system.
 * @param options - Optional installation options (supports --force flag).
 * @param parentLogger - The parent logger for creating sub-loggers.
 * @param shellExecutor - The shell executor function (defaults to Bun's $ operator).
 * @returns A promise that resolves to the installation result.
 */
export async function installFromBrew(
  toolName: string,
  toolConfig: BrewToolConfig,
  _context: IInstallContext,
  options: IInstallOptions | undefined,
  parentLogger: TsLogger,
  shellExecutor: IShell,
  installShell?: IShell,
): Promise<BrewInstallResult> {
  const logger = parentLogger.getSubLogger({ name: "installFromBrew" });
  logger.debug(messages.installing(toolName), toolConfig.installParams);

  if (!toolConfig.installParams) {
    return {
      success: false,
      error: "Install parameters not specified",
    };
  }

  const params = toolConfig.installParams;
  const formula = params.formula || toolName;
  const isCask = params.cask || false;
  const tap = params.tap;
  const trust = params.trust;
  const args = params.args;
  const link = params.link;
  const service = params.service;

  const operation = async (): Promise<BrewInstallResult> => {
    const loggingShell = installShell ?? createLoggingShell(shellExecutor, logger);
    await executeBrewInstall(
      formula,
      isCask,
      tap,
      trust,
      args,
      link,
      service,
      options?.force,
      logger,
      shellExecutor,
      loggingShell,
    );

    const formulaPrefix: string = await getBrewPrefix(formula, logger, shellExecutor);
    const binaryPaths = getBinaryPaths(toolConfig.binaries, `${formulaPrefix}/bin`);

    let version: string | undefined;

    const mainBinaryPath = binaryPaths[0];
    if (params.versionArgs && params.versionRegex && mainBinaryPath) {
      version = await detectVersionViaCli({
        binaryPath: mainBinaryPath,
        args: params.versionArgs,
        regex: params.versionRegex,
        shellExecutor,
      });
    } else {
      version = await getBrewVersion(formula, logger, shellExecutor);
    }

    const metadata: IBrewInstallMetadata = {
      method: "brew",
      formula,
      isCask,
      tap,
      trust,
      args,
      service,
      link,
    };

    const result: BrewInstallResult = {
      success: true,
      binaryPaths,
      version: version || undefined,
      metadata,
    };

    return result;
  };

  return withInstallErrorHandling("brew", toolName, logger, operation);
}

/**
 * Retrieves the installed version of a Homebrew formula.
 *
 * @param formula - The name of the Homebrew formula.
 * @param logger - The logger instance for logging operations.
 * @param shell - The shell executor.
 * @returns A promise that resolves to the version string, or null if not found.
 */
async function getBrewVersion(formula: string, logger: TsLogger, shell: IShell): Promise<string | undefined> {
  try {
    logger.debug(messages.fetchingVersion(formula));
    const result = await shell`brew info --json ${formula}`.quiet().noThrow();
    const output: string = result.stdout.toString();
    const rawData = JSON.parse(output);
    const info: BrewInfo[] = z.array(BrewInfoSchema).parse(rawData);

    if (info.length > 0 && info[0]?.versions.stable) {
      const rawVersion: string = info[0].versions.stable;
      const version: string = normalizeVersion(rawVersion);
      logger.debug(messages.versionFetched(formula, version));
      return version;
    }

    logger.debug(messages.versionNotFound(formula));
    return undefined;
  } catch (error) {
    logger.debug(messages.versionFetchFailed(formula), error);
    return undefined;
  }
}

/**
 * Gets the Homebrew prefix (installation directory) for a formula.
 *
 * @param formula - The name of the Homebrew formula.
 * @param logger - The logger instance for logging operations.
 * @param shell - The shell executor.
 * @returns A promise that resolves to the prefix path.
 * @throws {Error} If the prefix cannot be determined.
 */
async function getBrewPrefix(formula: string, logger: TsLogger, shell: IShell): Promise<string> {
  try {
    const result = await shell`brew --prefix ${formula}`.quiet();
    const prefix: string = result.stdout.toString().trim();
    logger.debug(messages.prefixFetched(formula, prefix));
    return prefix;
  } catch (error) {
    logger.debug(messages.prefixFetchFailed(formula), error);
    // Fall back to /opt/homebrew/opt/{formula} on Apple Silicon
    // or /usr/local/opt/{formula} on Intel
    const brewPrefix = await shell`brew --prefix`.quiet();
    const fallbackPrefix: string = `${brewPrefix.stdout.toString().trim()}/opt/${formula}`;
    logger.debug(messages.prefixFallback(formula, fallbackPrefix));
    return fallbackPrefix;
  }
}

/**
 * Executes the Homebrew install command for a formula or cask.
 *
 * This function handles trusting repositories, tapping custom repositories,
 * running `brew install` with custom args, symlinking keg-only formulas,
 * and managing background services.
 *
 * @param formula - The name of the formula or cask to install.
 * @param isCask - Whether this is a cask installation.
 * @param tap - Optional tap repository or array of repositories to add.
 * @param trust - Optional tap repository or array of repositories to trust.
 * @param args - Optional CLI flags to pass to `brew install`.
 * @param link - Optional symlinking instructions for keg-only formulas.
 * @param service - Optional service action for Homebrew services (`start` or `run`).
 * @param force - Whether to force reinstallation.
 * @param logger - The logger instance for logging operations.
 * @param shell - The shell executor.
 * @param installShell - The logging shell executor for install commands.
 * @returns A promise that resolves when installation is complete.
 * @throws {Error} If the installation fails.
 */
async function executeBrewInstall(
  formula: string,
  isCask: boolean,
  tap: BrewTapInput,
  trust: BrewTapInput,
  args: string[] | undefined,
  link: BrewLinkInput,
  service: BrewServiceInput,
  force: boolean | undefined,
  logger: TsLogger,
  shell: IShell,
  installShell: IShell,
): Promise<void> {
  if (trust) {
    const trustTargets = Array.isArray(trust) ? trust : [trust];
    for (const t of trustTargets) {
      logger.debug(messages.executingCommand(`brew trust ${t}`));
      await shell`brew trust ${t}`.quiet();
    }
  }

  if (tap) {
    const taps = Array.isArray(tap) ? tap : [tap];
    for (const t of taps) {
      logger.debug(messages.executingCommand(`brew tap ${t}`));
      await shell`brew tap ${t}`.quiet();
    }
  }

  const installArgs = ["install"];
  if (isCask) {
    installArgs.push("--cask");
  }
  if (force) {
    installArgs.push("--force");
  }
  if (args && args.length > 0) {
    installArgs.push(...args);
  }
  installArgs.push(formula);

  logger.info(messages.executingCommand(`brew ${installArgs.join(" ")}`));
  await installShell`brew ${installArgs}`;

  if (link) {
    const linkArgs = ["link"];
    if (typeof link === "object") {
      if (link.overwrite) {
        linkArgs.push("--overwrite");
      }
      if (link.force) {
        linkArgs.push("--force");
      }
    }
    linkArgs.push(formula);
    logger.info(messages.executingCommand(`brew ${linkArgs.join(" ")}`));
    await installShell`brew ${linkArgs}`;
  }

  if (service) {
    const action = typeof service === "string" ? service : "start";
    const serviceArgs = ["services", action, formula];
    logger.info(messages.executingCommand(`brew ${serviceArgs.join(" ")}`));
    await installShell`brew ${serviceArgs}`;
  }
}
