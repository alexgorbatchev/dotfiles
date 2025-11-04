import type { TsLogger } from '@dotfiles/logger';
import type { BaseInstallContext, BrewToolConfig } from '@dotfiles/schemas';
import { normalizeVersion } from '@dotfiles/utils';
import { $ } from 'bun';
import type { BrewInstallMetadata, BrewInstallResult, InstallOptions } from '../types';
import { getBinaryPaths, withInstallErrorHandling } from '../utils';
import { messages } from '../utils/log-messages';

type ShellExecutor = typeof $;

/**
 * Install a tool using Homebrew
 *
 * Installs tools via the Homebrew package manager on macOS and Linux.
 * Automatically fetches the installed version using `brew info --json <formula>`.
 *
 * @param toolName - Name of the tool being installed
 * @param toolConfig - Brew tool configuration with formula, cask, and tap settings
 * @param context - Installation context with paths and system info
 * @param options - Optional installation options (force, verbose, etc.)
 * @param parentLogger - Logger instance for structured logging
 * @param shellExecutor - Shell executor (defaults to Bun's $, injectable for testing)
 * @returns Promise resolving to installation result with version and binary paths
 *
 * @remarks
 * The function performs the following steps:
 * 1. Adds any specified taps to Homebrew
 * 2. Executes `brew install` with appropriate flags
 * 3. Fetches version information via `brew info --json <formula>`
 * 4. Returns binary paths and version (if available)
 *
 * Version fetching failures are handled gracefully - installation succeeds
 * even if version information cannot be determined.
 */
export async function installFromBrew(
  toolName: string,
  toolConfig: BrewToolConfig,
  context: BaseInstallContext,
  options: InstallOptions | undefined,
  parentLogger: TsLogger,
  shellExecutor: ShellExecutor = $
): Promise<BrewInstallResult> {
  const logger = parentLogger.getSubLogger({ name: 'installFromBrew' });
  logger.debug(messages.brew.installing(toolName), toolConfig.installParams);

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

    // Fetch version information
    const version: string | null = await getBrewVersion(formula, logger, shellExecutor);

    const binaryPaths = getBinaryPaths(toolConfig.binaries, toolName, context.installDir);

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

async function getBrewVersion(formula: string, logger: TsLogger, $: ShellExecutor): Promise<string | null> {
  try {
    logger.debug(messages.brew.fetchingVersion(formula));
    const result = await $`brew info --json ${formula}`.quiet().nothrow();
    const output: string = result.stdout.toString();
    const info: BrewInfo[] = JSON.parse(output);

    if (info.length > 0 && info[0]?.versions?.stable) {
      const rawVersion: string = info[0].versions.stable;
      const version: string = normalizeVersion(rawVersion);
      logger.debug(messages.brew.versionFetched(formula, version));
      return version;
    }

    logger.debug(messages.brew.versionNotFound(formula));
    return null;
  } catch (error) {
    logger.debug(messages.brew.versionFetchFailed(formula), error);
    return null;
  }
}

interface BrewInfo {
  name: string;
  versions: {
    stable: string;
    head?: string;
    bottle?: boolean;
  };
}

async function executeBrewInstall(
  formula: string,
  isCask: boolean,
  tap: string | string[] | undefined,
  force: boolean | undefined,
  logger: TsLogger,
  $: ShellExecutor
): Promise<void> {
  // Add taps if specified
  if (tap) {
    const taps = Array.isArray(tap) ? tap : [tap];
    for (const t of taps) {
      const tapCommand = `brew tap ${t}`;
      logger.debug(messages.brew.executingCommand(tapCommand));
      await $`brew tap ${t}`.quiet();
    }
  }

  // Build install command
  const installArgs = ['install'];
  if (isCask) {
    installArgs.push('--cask');
  }
  if (force) {
    installArgs.push('--force');
  }
  installArgs.push(formula);

  const installCommand = `brew ${installArgs.join(' ')}`;
  logger.debug(messages.brew.executingCommand(installCommand));

  // Execute the install command
  await $`brew ${installArgs}`.quiet();
}
