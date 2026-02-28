import { type IInstallContext, type IInstallOptions, type Shell } from '@dotfiles/core';
import { getBinaryPaths, withInstallErrorHandling } from '@dotfiles/installer';
import type { TsLogger } from '@dotfiles/logger';
import { detectVersionViaCli, normalizeVersion } from '@dotfiles/utils';
import path from 'node:path';
import { z } from 'zod';
import { messages } from './log-messages';
import type { NpmToolConfig } from './schemas';
import type { INpmInstallMetadata, NpmInstallResult } from './types';

const npmLsOutputSchema = z.object({
  dependencies: z.record(z.string(), z.object({ version: z.string() })),
});

/**
 * Installs a tool using npm.
 *
 * This function handles the complete installation process for npm tools:
 * 1. Installs the npm package to the staging directory using `npm install --prefix`
 * 2. Retrieves version information from the installed package
 * 3. Determines binary paths from the node_modules/.bin directory
 *
 * @param toolName - The name of the tool to install.
 * @param toolConfig - The configuration for the npm tool.
 * @param context - The base installation context.
 * @param _options - Optional installation options.
 * @param parentLogger - The parent logger for creating sub-loggers.
 * @param shellExecutor - The shell executor function.
 * @returns A promise that resolves to the installation result.
 */
export async function installFromNpm(
  toolName: string,
  toolConfig: NpmToolConfig,
  context: IInstallContext,
  _options: IInstallOptions | undefined,
  parentLogger: TsLogger,
  shellExecutor: Shell,
): Promise<NpmInstallResult> {
  const logger = parentLogger.getSubLogger({ name: 'installFromNpm' });

  if (!toolConfig.installParams) {
    return {
      success: false,
      error: 'Install parameters not specified',
    };
  }

  const params = toolConfig.installParams;
  const packageName: string = params.package || toolName;
  const packageVersion: string | undefined = params.version;
  const packageSpec: string = packageVersion ? `${packageName}@${packageVersion}` : packageName;

  logger.debug(messages.installing(packageName));

  const operation = async (): Promise<NpmInstallResult> => {
    await executeNpmInstall(packageSpec, context.stagingDir, logger, shellExecutor);

    const binDir: string = path.join(context.stagingDir, 'node_modules', '.bin');
    const binaryPaths: string[] = getBinaryPaths(toolConfig.binaries, binDir);

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
    } else {
      version = await getNpmPackageVersion(packageName, context.stagingDir, logger, shellExecutor) ?? undefined;
    }

    const metadata: INpmInstallMetadata = {
      method: 'npm',
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

  return withInstallErrorHandling('npm', toolName, logger, operation);
}

/**
 * Executes the npm install command to install a package into a specific directory.
 *
 * @param packageSpec - The package specifier (e.g., `prettier`, `prettier@3.0.0`).
 * @param installDir - The directory to install the package into.
 * @param logger - The logger instance for logging operations.
 * @param shell - The shell executor.
 * @returns A promise that resolves when installation is complete.
 * @throws {Error} If the installation fails.
 */
async function executeNpmInstall(
  packageSpec: string,
  installDir: string,
  logger: TsLogger,
  shell: Shell,
): Promise<void> {
  const command = `npm install --prefix ${installDir} ${packageSpec}`;
  logger.debug(messages.executingCommand(command));
  await shell`npm install --prefix ${installDir} ${packageSpec}`.quiet();
}

/**
 * Retrieves the installed version of an npm package from the local installation.
 *
 * @param packageName - The name of the npm package.
 * @param installDir - The directory where the package is installed.
 * @param logger - The logger instance for logging operations.
 * @param shell - The shell executor.
 * @returns A promise that resolves to the version string, or null if not found.
 */
async function getNpmPackageVersion(
  packageName: string,
  installDir: string,
  logger: TsLogger,
  shell: Shell,
): Promise<string | null> {
  try {
    const result = await shell`npm ls --prefix ${installDir} ${packageName} --json`.quiet().noThrow();
    const output: string = result.stdout.toString();
    const parsed = npmLsOutputSchema.safeParse(JSON.parse(output));

    if (parsed.success) {
      const pkgInfo = parsed.data.dependencies[packageName];
      if (pkgInfo) {
        logger.debug(messages.versionFetched(packageName, pkgInfo.version));
        return pkgInfo.version;
      }
    }

    logger.debug(messages.versionFetchFailed(packageName));
    return null;
  } catch (error) {
    logger.debug(messages.versionFetchFailed(packageName), error);
    return null;
  }
}
