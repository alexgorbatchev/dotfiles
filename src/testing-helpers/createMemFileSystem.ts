import { MemFileSystem, type IFileSystem } from '@modules/file-system';
import { mock } from 'bun:test';
import type { DirectoryJSON } from 'memfs';
import path from 'path';

/**
 * Generic type for a mocked function.
 */
type MockFn<T extends (...args: any[]) => any> = ReturnType<typeof mock<T>>;

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
  [K in keyof Omit<
    Required<MemFileSystemOptions>,
    'initialVolumeJson' | 'initialSymlinks'
  >]: MockFn<IFileSystem[K]>;
};

/**
 * Defines the structure of the object returned by `createMemFileSystem`.
 */
export interface MemFileSystemReturn {
  /** The fully assembled mock/spy IFileSystem instance. */
  fs: IFileSystem;
  /** An object containing the individual spies or mocks for each method. */
  spies: FileSystemSpies;
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
export function createMemFileSystem(options: MemFileSystemOptions = {}): MemFileSystemReturn {
  const { initialVolumeJson, initialSymlinks, ...mocks } = options;
  const memFs = new MemFileSystem(initialVolumeJson);

  const spies: FileSystemSpies = {
    ensureDir: mock(mocks.ensureDir ?? memFs.ensureDir.bind(memFs)),
    chmod: mock(mocks.chmod ?? memFs.chmod.bind(memFs)),
    exists: mock(mocks.exists ?? memFs.exists.bind(memFs)),
    copyFile: mock(mocks.copyFile ?? memFs.copyFile.bind(memFs)),
    symlink: mock(mocks.symlink ?? memFs.symlink.bind(memFs)),
    rm: mock(mocks.rm ?? memFs.rm.bind(memFs)),
    readFile: mock(mocks.readFile ?? memFs.readFile.bind(memFs)),
    writeFile: mock(mocks.writeFile ?? memFs.writeFile.bind(memFs)),
    mkdir: mock(mocks.mkdir ?? memFs.mkdir.bind(memFs)),
    readdir: mock(mocks.readdir ?? memFs.readdir.bind(memFs)),
    stat: mock(mocks.stat ?? memFs.stat.bind(memFs)),
    lstat: mock(mocks.lstat ?? memFs.lstat.bind(memFs)),
    readlink: mock(mocks.readlink ?? memFs.readlink.bind(memFs)),
    rename: mock(mocks.rename ?? memFs.rename.bind(memFs)),
    rmdir: mock(mocks.rmdir ?? memFs.rmdir.bind(memFs)),
  };

  const fs: IFileSystem = { ...spies };

  // Initialize symlinks if provided
  if (initialSymlinks) {
    // Process each symlink entry
    for (const [target, source] of Object.entries(initialSymlinks)) {
      // Ensure the target directory exists
      spies.ensureDir(path.dirname(source));
      // Create the symlink
      spies.symlink(target, source);
    }
  }

  return {
    fs,
    spies,
  };
}
