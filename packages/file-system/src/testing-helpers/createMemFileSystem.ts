import { type Mock, mock } from 'bun:test';
import path from 'node:path';
import type { DirectoryJSON } from 'memfs';
import type { IFileSystem } from '../IFileSystem';
import { MemFileSystem } from '../MemFileSystem';

/**
 * Options for creating a customizable in-memory file system.
 * Each property other than `initialVolumeJson` is an optional mock implementation
 * for the corresponding IFileSystem method.
 */
export interface MemFileSystemOptions {
  initialVolumeJson?: DirectoryJSON;
  initialSymlinks?: Record<string, string>;

  ensureDir?: IFileSystem['ensureDir'];
  chmod?: IFileSystem['chmod'];
  exists?: IFileSystem['exists'];
  copyFile?: IFileSystem['copyFile'];
  symlink?: IFileSystem['symlink'];
  rm?: IFileSystem['rm'];
  readFile?: IFileSystem['readFile'];
  readFileBuffer?: IFileSystem['readFileBuffer'];
  writeFile?: IFileSystem['writeFile'];
  mkdir?: IFileSystem['mkdir'];
  readdir?: IFileSystem['readdir'];
  stat?: IFileSystem['stat'];
  lstat?: IFileSystem['lstat'];
  readlink?: IFileSystem['readlink'];
  rename?: IFileSystem['rename'];
  rmdir?: IFileSystem['rmdir'];
}

/**
 * Type for the collection of spies/mocks on the file system methods.
 */
export type FileSystemSpies = {
  [K in keyof Omit<Required<MemFileSystemOptions>, 'initialVolumeJson' | 'initialSymlinks'>]: Mock<IFileSystem[K]>;
};

/**
 * Type for the collection of spies/mocks on the file system methods.
 */
export type MockedFileSystem = IFileSystem & { asIFileSystem: IFileSystem } & {
  [K in keyof IFileSystem as IFileSystem[K] extends (...args: unknown[]) => unknown ? K : never]: Mock<IFileSystem[K]>;
};

/**
 * Defines the structure of the object returned by `createMemFileSystem`.
 */
export interface MemFileSystemReturn {
  /** The fully assembled mock/spy IFileSystem instance. */
  fs: MockedFileSystem;

  /** An object containing the individual spies or mocks for each method. */
  spies: FileSystemSpies;

  /**
   * Adds files to the file system.
   * @param files - A record of file paths and their contents.
   */
  addFiles: (files: Record<string, string>) => Promise<void>;

  /**
   * Adds symlinks to the file system.
   *
   * @param symlinks - A record of symlink targets and their sources.
   *
   * @example
   * ```typescript
   * // ln -s [realFile:source] [symlinkPath:target]
   * memFs.addSymlinks({
   *   'symlinkPath': 'realFile',
   * });
   */
  addSymlinks: (symlinks: Record<string, string>) => Promise<void>;
}

/**
 * Creates an `IFileSystem` instance using `MemFileSystem`, with the ability to
 * spy on or mock individual methods.
 *
 * @param options - Optional. An object to configure the file system.
 * @param options.initialVolumeJson - Optional JSON object (memfs DirectoryJSON) to initialize the file system volume.
 * @param options.initialSymlinks - Optional record of symlinks to create, where keys are targets and values are sources.
 * @param options... - Optional mock implementations for any `IFileSystem` method.
 * @returns An object containing the `fs` instance and the `spies`.
 */
export async function createMemFileSystem(options: MemFileSystemOptions = {}): Promise<MemFileSystemReturn> {
  const { initialVolumeJson, initialSymlinks, ...mocks } = options;
  const memFs = new MemFileSystem(initialVolumeJson);

  const spies = createFileSystemSpies(memFs, mocks);
  const fs: MockedFileSystem = { ...spies, asIFileSystem: spies as IFileSystem };

  const addSymlinks = createSymlinkAdder(spies);
  const addFiles = createFileAdder(spies);

  if (initialSymlinks) {
    await addSymlinks(initialSymlinks);
  }

  return {
    fs,
    spies,
    addFiles,
    addSymlinks,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Test helper function with many mock bindings
function createFileSystemSpies(memFs: MemFileSystem, mocks: Partial<IFileSystem>): FileSystemSpies {
  return {
    ensureDir: mock(mocks.ensureDir ?? memFs.ensureDir.bind(memFs)),
    chmod: mock(mocks.chmod ?? memFs.chmod.bind(memFs)),
    exists: mock(mocks.exists ?? memFs.exists.bind(memFs)),
    copyFile: mock(mocks.copyFile ?? memFs.copyFile.bind(memFs)),
    symlink: mock(mocks.symlink ?? memFs.symlink.bind(memFs)),
    rm: mock(mocks.rm ?? memFs.rm.bind(memFs)),
    readFile: mock(mocks.readFile ?? memFs.readFile.bind(memFs)),
    readFileBuffer: mock(mocks.readFileBuffer ?? memFs.readFileBuffer.bind(memFs)),
    writeFile: mock(mocks.writeFile ?? memFs.writeFile.bind(memFs)),
    mkdir: mock(mocks.mkdir ?? memFs.mkdir.bind(memFs)),
    readdir: mock(mocks.readdir ?? memFs.readdir.bind(memFs)),
    stat: mock(mocks.stat ?? memFs.stat.bind(memFs)),
    lstat: mock(mocks.lstat ?? memFs.lstat.bind(memFs)),
    readlink: mock(mocks.readlink ?? memFs.readlink.bind(memFs)),
    rename: mock(mocks.rename ?? memFs.rename.bind(memFs)),
    rmdir: mock(mocks.rmdir ?? memFs.rmdir.bind(memFs)),
  };
}

function createSymlinkAdder(spies: FileSystemSpies) {
  return async (symlinks: Record<string, string>) => {
    for (const [target, source] of Object.entries(symlinks)) {
      await spies.ensureDir(path.dirname(source));
      await spies.symlink(target, source);
    }
  };
}

function createFileAdder(spies: FileSystemSpies) {
  return async (files: Record<string, string>) => {
    for (const [filePath, contents] of Object.entries(files)) {
      await spies.ensureDir(path.dirname(filePath));
      await spies.writeFile(filePath, contents);
    }
  };
}
