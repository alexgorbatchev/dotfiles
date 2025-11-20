import * as path from 'node:path';
import type { ProjectConfigPaths } from '@dotfiles/config';
import { getDefaultConfig } from '@dotfiles/config';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';

type InternalProjectConfigPaths = Omit<ProjectConfigPaths, 'manifestPath'>;

/**
 * Options for creating test directories
 */
export interface ITestDirectoryOptions {
  /** Name for the temporary directory */
  testName?: string;
  /** Optional map of additional directories to create (key: directory identifier, value: path relative to base directory) */
  additionalDirs?: Record<string, { path: string; relativeTo?: keyof InternalProjectConfigPaths }>;
  /** Optional array of tool-specific directories to create in binaries directory */
  toolDirs?: string[];

  /** Paths to create from `ProjectConfig.paths` */
  paths?: InternalProjectConfigPaths;
}

/**
 * Structure containing paths to test directories
 */
export interface ITestDirectories {
  paths: ProjectConfigPaths;

  /** Map of additional directories created */
  additionalDirs: Record<string, string>;

  /**
   * Get an additional directory by key
   * @param key - The key of the additional directory
   * @returns The path to the additional directory
   * @throws Error if the directory doesn't exist
   */
  getDir(key: string): string;
}

/**
 * Creates a temporary directory for tests.
 *
 * @param name - The name of the temporary directory
 * @returns The path to the created temporary directory
 */
async function createTempDir(fs: IFileSystem, name: string) {
  const currentDir = path.dirname(new URL(import.meta.url).pathname);
  const tempDir = path.join(currentDir, '../tmp', name);
  if (await fs.exists(tempDir)) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
  await fs.ensureDir(tempDir);
  return tempDir;
}

/**
 * Creates a standard directory structure for the test environment based on `ProjectConfig.paths`.
 *
 * @param options - Options for creating test directories
 * @returns Object containing paths to created directories
 */
export async function createTestDirectories(
  logger: TsLogger,
  fs: IFileSystem,
  options: ITestDirectoryOptions
): Promise<ITestDirectories> {
  const homeDir = await createTempDir(
    fs,
    `createTestDirectories${options.testName !== undefined ? `--${options.testName}` : ''}`
  );
  const defaultConfig = await getDefaultConfig(
    logger,
    fs,
    { homeDir, platform: 'linux', arch: 'x64' },
    { HOME: homeDir },
    `${homeDir}/config.yaml`
  );
  const paths = { ...defaultConfig.paths, ...(options.paths || {}) };

  await fs.ensureDir(paths.homeDir);
  await fs.ensureDir(paths.dotfilesDir);
  await fs.ensureDir(paths.generatedDir);
  await fs.ensureDir(paths.toolConfigsDir);
  await fs.ensureDir(paths.binariesDir);
  await fs.ensureDir(paths.targetDir);
  await fs.ensureDir(paths.shellScriptsDir);

  const result: ITestDirectories = {
    paths: {
      ...paths,
    },

    additionalDirs: {},

    // Helper method to get a directory with error checking
    getDir(key: string): string {
      const dir = this.additionalDirs[key];
      if (!dir) {
        throw new Error(
          `Additional directory '${key}' not found. Available keys: ${Object.keys(this.additionalDirs).join(', ')}`
        );
      }
      return dir;
    },
  };

  // Create additional directories if needed
  if (options.additionalDirs) {
    for await (const [key, dirInfo] of Object.entries(options.additionalDirs)) {
      const relativeTo = dirInfo.relativeTo;
      const baseDir = (relativeTo && result.paths[relativeTo]) || homeDir;
      const fullPath = path.join(baseDir, dirInfo.path);
      await fs.ensureDir(fullPath);
      result.additionalDirs[key] = fullPath;
    }
  }

  // Create tool-specific directories in binaries directory if needed
  if (options.toolDirs && options.toolDirs.length > 0) {
    for (const toolDir of options.toolDirs) {
      await fs.ensureDir(path.join(paths.binariesDir, toolDir));
    }
  }

  return result;
}
