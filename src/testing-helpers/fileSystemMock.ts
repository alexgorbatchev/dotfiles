/**
 * @file generator/src/testing-helpers/fileSystemMock.ts
 * @description Provides a test helper for creating a customizable mock IFileSystem instance.
 *
 * ## Development Plan
 *
 * ### Overview
 * This file provides a helper function `createMockFileSystem` to easily create
 * mock `IFileSystem` instances for testing, allowing individual methods to be
 * mocked with custom implementations or default bun:test mocks.
 *
 * ### Tasks
 * - [x] Define `MockFileSystemOptions` interface.
 * - [x] Define `createMockFileSystem` function signature.
 * - [x] Introduce `MockFn` type alias.
 * - [x] Implement the function to return an `IFileSystem` mock.
 *   - [x] Each method should be mockable via options.
 *   - [x] Provide default mock implementations if not overridden.
 * - [x] Add JSDoc for the function and interface.
 */
import { mock } from 'bun:test';
import type { IFileSystem } from '@modules/file-system/IFileSystem';
import type { Stats } from 'fs';

/**
 * Generic type for a mocked function.
 */
type MockFn<T extends (...args: any[]) => any> = ReturnType<typeof mock<T>>;

/**
 * Interface for providing overrides for the default `stat` mock.
 * Allows setting boolean values for `is*` methods and overriding other `Stats` properties.
 */
export interface StatOverrides
  extends Partial<
    Omit<
      Stats,
      | 'isFile'
      | 'isDirectory'
      | 'isBlockDevice'
      | 'isCharacterDevice'
      | 'isSymbolicLink'
      | 'isFIFO'
      | 'isSocket'
    >
  > {
  isFile?: boolean;
  isDirectory?: boolean;
  isBlockDevice?: boolean;
  isCharacterDevice?: boolean;
  isSymbolicLink?: boolean;
  isFIFO?: boolean;
  isSocket?: boolean;
}

/**
 * Options for creating a custom mock file system.
 * Each property is an optional mock implementation for the corresponding IFileSystem method.
 */
export interface MockFileSystemOptions {
  ensureDir?: MockFn<(path: string) => Promise<void>>;
  chmod?: MockFn<(path: string, mode: number | string) => Promise<void>>;
  exists?: MockFn<(path: string) => Promise<boolean>>;
  copyFile?: MockFn<(src: string, dest: string, flags?: number) => Promise<void>>;
  symlink?: MockFn<
    (target: string, path: string, type?: 'file' | 'dir' | 'junction') => Promise<void>
  >;
  rm?: MockFn<(path: string, options?: { recursive?: boolean; force?: boolean }) => Promise<void>>;
  readFile?: MockFn<(path: string, encoding?: BufferEncoding) => Promise<string>>;
  writeFile?: MockFn<
    (
      path: string,
      data: string | NodeJS.ArrayBufferView,
      encoding?: BufferEncoding
    ) => Promise<void>
  >;
  mkdir?: MockFn<(path: string, options?: { recursive?: boolean }) => Promise<void>>;
  readdir?: MockFn<(path: string) => Promise<string[]>>;
  stat?: MockFn<(path: string) => Promise<Stats>>;
  statOverrides?: StatOverrides; // New property for stat overrides
  readlink?: MockFn<(path: string) => Promise<string>>;
  rename?: MockFn<(oldPath: string, newPath: string) => Promise<void>>;
  rmdir?: MockFn<(path: string, options?: { recursive?: boolean }) => Promise<void>>;
}

/**
 * Defines the structure of the object returned by `createMockFileSystem`.
 */
export interface MockFileSystemReturn {
  /** The fully assembled mock IFileSystem instance. */
  mockFileSystem: IFileSystem;
  /** An object containing the individual mock functions used to build the mockFileSystem. */
  fileSystemMocks: Required<MockFileSystemOptions>; // Using Required to ensure all mocks are present
}

/**
 * Creates a customizable mock `IFileSystem` object for testing purposes,
 * and returns both the assembled mock and the individual mock functions.
 *
 * @param options - Optional. An object containing mock implementations for IFileSystem methods.
 * @returns An object containing the `mockFileSystem` and `fileSystemMocks`.
 */
export function createMockFileSystem(options: MockFileSystemOptions = {}): MockFileSystemReturn {
  const defaultStatMock = mock(async (_path: string): Promise<Stats> => {
    const overrides: StatOverrides = options.statOverrides ?? {};

    const baseStats: Stats = {
      isFile: () => false,
      isDirectory: () => true,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isSymbolicLink: () => false,
      isFIFO: () => false,
      isSocket: () => false,
      dev: 0,
      ino: 0,
      mode: 0,
      nlink: 0,
      uid: 0,
      gid: 0,
      rdev: 0,
      size: 0,
      blksize: 0,
      blocks: 0,
      atimeMs: 0,
      mtimeMs: 0,
      ctimeMs: 0,
      birthtimeMs: 0,
      atime: new Date(),
      mtime: new Date(),
      ctime: new Date(),
      birthtime: new Date(),
    };

    // Helper to create the is* methods based on overrides
    const createIsFlag = (
      flagName: keyof Pick<
        StatOverrides,
        | 'isFile'
        | 'isDirectory'
        | 'isBlockDevice'
        | 'isCharacterDevice'
        | 'isSymbolicLink'
        | 'isFIFO'
        | 'isSocket'
      >,
      defaultGetter: () => boolean
    ): (() => boolean) => {
      if (typeof overrides[flagName] === 'boolean') {
        return () => overrides[flagName] as boolean;
      }
      return defaultGetter;
    };

    // Create a Stats object, applying overrides
    const statResult: Stats = {
      ...baseStats,
      // Apply non-function overrides directly
      ...(Object.fromEntries(
        Object.entries(overrides).filter(
          ([key, value]) =>
            typeof value !== 'function' && typeof (baseStats as any)[key] !== 'function'
        )
      ) as Partial<Stats>),
      // Apply is* method overrides
      isFile: createIsFlag('isFile', baseStats.isFile),
      isDirectory: createIsFlag('isDirectory', baseStats.isDirectory),
      isBlockDevice: createIsFlag('isBlockDevice', baseStats.isBlockDevice),
      isCharacterDevice: createIsFlag('isCharacterDevice', baseStats.isCharacterDevice),
      isSymbolicLink: createIsFlag('isSymbolicLink', baseStats.isSymbolicLink),
      isFIFO: createIsFlag('isFIFO', baseStats.isFIFO),
      isSocket: createIsFlag('isSocket', baseStats.isSocket),
    };

    // Ensure all other Stats properties are present, taking from overrides or baseStats
    // This loop is to ensure that properties not explicitly handled above (like dev, ino, etc.)
    // are correctly copied from overrides if present, otherwise from baseStats.
    for (const key in baseStats) {
      if (Object.prototype.hasOwnProperty.call(baseStats, key)) {
        const k = key as keyof Stats;
        if (typeof (baseStats as any)[k] !== 'function') {
          // Only copy data properties
          if (Object.prototype.hasOwnProperty.call(overrides, k)) {
            statResult[k] = (overrides as any)[k];
          } else {
            statResult[k] = (baseStats as any)[k];
          }
        }
      }
    }
    return statResult;
  });

  const ensureDirMock = options.ensureDir ?? mock(async () => {});
  const chmodMock = options.chmod ?? mock(async () => {});
  const existsMock = options.exists ?? mock(async () => false);
  const copyFileMock = options.copyFile ?? mock(async () => {});
  const symlinkMock = options.symlink ?? mock(async () => {});
  const rmMock = options.rm ?? mock(async () => {});
  const readFileMock = options.readFile ?? mock(async () => '');
  const writeFileMock = options.writeFile ?? mock(async () => {});
  const mkdirMock = options.mkdir ?? mock(async () => {});
  const readdirMock = options.readdir ?? mock(async () => []);
  const statMock = options.stat ?? defaultStatMock;
  const readlinkMock = options.readlink ?? mock(async () => '');
  const renameMock = options.rename ?? mock(async () => {});
  const rmdirMock = options.rmdir ?? mock(async () => {});

  const fileSystemMocks: Required<MockFileSystemOptions> = {
    ensureDir: ensureDirMock,
    chmod: chmodMock,
    exists: existsMock,
    copyFile: copyFileMock,
    symlink: symlinkMock,
    rm: rmMock,
    readFile: readFileMock,
    writeFile: writeFileMock,
    mkdir: mkdirMock,
    readdir: readdirMock,
    stat: statMock,
    statOverrides: options.statOverrides ?? {}, // Include statOverrides if provided, or default
    readlink: readlinkMock,
    rename: renameMock,
    rmdir: rmdirMock,
  };

  const mockFileSystem: IFileSystem = {
    ensureDir: ensureDirMock,
    chmod: chmodMock,
    exists: existsMock,
    copyFile: copyFileMock,
    symlink: symlinkMock,
    rm: rmMock,
    readFile: readFileMock,
    writeFile: writeFileMock,
    mkdir: mkdirMock,
    readdir: readdirMock,
    stat: statMock,
    readlink: readlinkMock,
    rename: renameMock,
    rmdir: rmdirMock,
  };

  return {
    mockFileSystem,
    fileSystemMocks,
  };
}
