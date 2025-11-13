import type { BaseInstallContext, InstallOptions } from '@dotfiles/core';
import { getBinaryPaths, withInstallErrorHandling } from '@dotfiles/installer';
import type { TsLogger } from '@dotfiles/logger';
import { normalizeVersion } from '@dotfiles/utils';
import { $ } from 'bun';
import { z } from 'zod';
import { messages } from './log-messages';
import type { BrewToolConfig } from './schemas';
import type { BrewInstallMetadata, BrewInstallResult } from './types';

type ShellExecutor = typeof $;

const BrewInfoSchema = z.object({
  name: z.string(),
  versions: z.object({
    stable: z.string(),
    head: z.string().optional(),
    bottle: z.boolean().optional(),
  }),
});

type BrewInfo = z.infer<typeof BrewInfoSchema>;

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
 * @param _context - The base installation context (unused for Homebrew).
 * @param options - Optional installation options (supports --force flag).
 * @param parentLogger - The parent logger for creating sub-loggers.
 * @param shellExecutor - The shell executor function (defaults to Bun's $ operator).
 * @returns A promise that resolves to the installation result.
 */
export async function installFromBrew(
  toolName: string,
  toolConfig: BrewToolConfig,
  _context: BaseInstallContext,
  options: InstallOptions | undefined,
  parentLogger: TsLogger,
  shellExecutor: ShellExecutor = $
): Promise<BrewInstallResult> {
  const logger = parentLogger.getSubLogger({ name: 'installFromBrew' });
  logger.debug(messages.installing(toolName), toolConfig.installParams);

  if (!toolConfig.installParams) {
    return {
      success: false,
      error: 'Install parameters not specified',
    };
  }

  const params = toolConfig.installParams;
  const formula = params.formula || toolName;
  const isCask = params.cask || false;
  const tap = params.tap;

  const operation = async (): Promise<BrewInstallResult> => {
    await executeBrewInstall(formula, isCask, tap, options?.force, logger, shellExecutor);

    const version: string | null = await getBrewVersion(formula, logger, shellExecutor);
    const formulaPrefix: string = await getBrewPrefix(formula, logger, shellExecutor);
    const binaryPaths = getBinaryPaths(toolConfig.binaries, toolName, `${formulaPrefix}/bin`);

    const metadata: BrewInstallMetadata = {
      method: 'brew',
      formula,
      isCask,
      tap,
    };

    const result: BrewInstallResult = {
      success: true,
      binaryPaths,
      version: version || undefined,
      metadata,
    };

    return result;
  };

  return withInstallErrorHandling('brew', toolName, logger, operation);
}

/**
 * Retrieves the installed version of a Homebrew formula.
 *
 * @param formula - The name of the Homebrew formula.
 * @param logger - The logger instance for logging operations.
 * @param $ - The shell executor function.
 * @returns A promise that resolves to the version string, or null if not found.
 */
async function getBrewVersion(formula: string, logger: TsLogger, $: ShellExecutor): Promise<string | null> {
  try {
    logger.debug(messages.fetchingVersion(formula));
    const result = await $`brew info --json ${formula}`.quiet().nothrow();
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
    return null;
  } catch (error) {
    logger.debug(messages.versionFetchFailed(formula), error);
    return null;
  }
}

/**
 * Gets the Homebrew prefix (installation directory) for a formula.
 *
 * @param formula - The name of the Homebrew formula.
 * @param logger - The logger instance for logging operations.
 * @param $ - The shell executor function.
 * @returns A promise that resolves to the prefix path.
 * @throws {Error} If the prefix cannot be determined.
 */
async function getBrewPrefix(formula: string, logger: TsLogger, $: ShellExecutor): Promise<string> {
  try {
    const result = await $`brew --prefix ${formula}`.quiet();
    const prefix: string = result.stdout.toString().trim();
    logger.debug(messages.prefixFetched(formula, prefix));
    return prefix;
  } catch (error) {
    logger.debug(messages.prefixFetchFailed(formula), error);
    // Fall back to /opt/homebrew/opt/{formula} on Apple Silicon
    // or /usr/local/opt/{formula} on Intel
    const brewPrefix = await $`brew --prefix`.quiet();
    const fallbackPrefix: string = `${brewPrefix.stdout.toString().trim()}/opt/${formula}`;
    logger.debug(messages.prefixFallback(formula, fallbackPrefix));
    return fallbackPrefix;
  }
}

/**
 * Executes the Homebrew install command for a formula or cask.
 *
 * This function handles tapping custom repositories if needed, then runs the
 * appropriate `brew install` command with optional --force flag.
 *
 * @param formula - The name of the formula or cask to install.
 * @param isCask - Whether this is a cask installation.
 * @param tap - Optional tap repository or array of repositories to add.
 * @param force - Whether to force reinstallation.
 * @param logger - The logger instance for logging operations.
 * @param $ - The shell executor function.
 * @returns A promise that resolves when installation is complete.
 * @throws {Error} If the installation fails.
 */
async function executeBrewInstall(
  formula: string,
  isCask: boolean,
  tap: string | string[] | undefined,
  force: boolean | undefined,
  logger: TsLogger,
  $: ShellExecutor
): Promise<void> {
  if (tap) {
    const taps = Array.isArray(tap) ? tap : [tap];
    for (const t of taps) {
      const tapCommand = `brew tap ${t}`;
      logger.debug(messages.executingCommand(tapCommand));
      await $`brew tap ${t}`.quiet();
    }
  }

  const installArgs = ['install'];
  if (isCask) {
    installArgs.push('--cask');
  }
  if (force) {
    installArgs.push('--force');
  }
  installArgs.push(formula);

  const installCommand = `brew ${installArgs.join(' ')}`;
  logger.debug(messages.executingCommand(installCommand));

  await $`brew ${installArgs}`.quiet();
}
