import type { AppConfig } from '@modules/config';
import type { IFileSystem } from '@modules/file-system';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createMockAppConfig, createMockClientLogger, createMockFileSystem, type LoggerMocks } from '@testing-helpers';
import type { GeneratedArtifactsManifest } from '@types';
import type { ConsolaInstance } from 'consola';
import {
  cleanupActionLogic,
  type CleanupCommandOptions,
  type CleanupCommandServices,
} from '../cleanupCommand';

// Mocks
let mockFileSystem: IFileSystem;
let mockAppConfig: AppConfig;
let mockClientLogger: ConsolaInstance; // This will be the ConsolaInstance
let loggerMocks: LoggerMocks; // This will hold the individual mock functions

// Mock functions for file system operations (keep these as they are specific to this test suite's needs)
let mockFsExists: import('bun:test').Mock<(...args: any[]) => Promise<boolean>>;
let mockFsReadFile: import('bun:test').Mock<(...args: any[]) => Promise<string>>;
let mockFsRm: import('bun:test').Mock<(...args: any[]) => Promise<void>>;

describe('CLI > commands > cleanup', () => {
  beforeEach(() => {
    mockFsExists = mock(async (_path: string) => false);
    mockFsReadFile = mock(async (_path: string, _encoding?: BufferEncoding) => '');
    mockFsRm = mock(async (_path: string, _options?: { recursive?: boolean; force?: boolean }) => {});

    const { mockFileSystem: mfs } = createMockFileSystem({
      exists: mockFsExists,
      readFile: mockFsReadFile,
      rm: mockFsRm,
    });
    mockFileSystem = mfs;

    mockAppConfig = createMockAppConfig({
      manifestPath: '.generated/tool-manifest.json',
      generatedDir: '.generated/',
    });

    const { mockClientLogger: mcl, loggerMocks: lm } = createMockClientLogger();
    mockClientLogger = mcl;
    loggerMocks = lm;
  });

  afterEach(() => {
    mockFsExists.mockClear();
    mockFsReadFile.mockClear();
    mockFsRm.mockClear();
  });

  test('manifest not found and --all-generated is false', async () => {
    mockFsExists.mockResolvedValue(false); 
    const services: CleanupCommandServices = {
      appConfig: mockAppConfig,
      fileSystem: mockFileSystem,
      clientLogger: mockClientLogger,
    };
    const options: CleanupCommandOptions = { allGenerated: false };

    await cleanupActionLogic(options, services);

    expect(mockFileSystem.exists).toHaveBeenCalledWith(mockAppConfig.manifestPath);
    expect(loggerMocks.info).toHaveBeenCalledWith(
      'Manifest not found and --all-generated flag not used. Nothing to clean based on manifest.'
    );
    expect(mockFileSystem.rm).not.toHaveBeenCalled();
  });

  test('manifest found with various artifacts, no --all-generated', async () => {
    const manifest: GeneratedArtifactsManifest = {
      lastGenerated: new Date().toISOString(),
      shims: ['/path/to/shim1', '/path/to/shim2'],
      shellInit: { path: '/path/to/shell/init.sh' },
      symlinks: [
        { sourcePath: '/src/sym1', targetPath: '/dest/sym1', status: 'created' },
        { sourcePath: '/src/sym2', targetPath: '/dest/sym2', status: 'created' },
      ],
    };
    mockFsExists.mockImplementation(async (path: string) => {
      if (path === mockAppConfig.manifestPath) return true;
      if (manifest.shims?.includes(path)) return true;
      if (path === manifest.shellInit?.path) return true;
      if (manifest.symlinks?.find((s) => s.targetPath === path)) return true;
      return false;
    });
    mockFsReadFile.mockResolvedValue(JSON.stringify(manifest));

    const services: CleanupCommandServices = {
      appConfig: mockAppConfig,
      fileSystem: mockFileSystem,
      clientLogger: mockClientLogger,
    };
    const options: CleanupCommandOptions = { allGenerated: false };

    await cleanupActionLogic(options, services);

    expect(mockFileSystem.readFile).toHaveBeenCalledWith(mockAppConfig.manifestPath, 'utf8');
    expect(mockFileSystem.rm).toHaveBeenCalledWith('/path/to/shim1');
    expect(mockFileSystem.rm).toHaveBeenCalledWith('/path/to/shim2');
    expect(mockFileSystem.rm).toHaveBeenCalledWith('/path/to/shell/init.sh');
    expect(mockFileSystem.rm).toHaveBeenCalledWith('/dest/sym1');
    expect(mockFileSystem.rm).toHaveBeenCalledWith('/dest/sym2');
    expect(mockFileSystem.rm).toHaveBeenCalledWith(mockAppConfig.manifestPath);
    expect(mockFileSystem.rm).not.toHaveBeenCalledWith(mockAppConfig.generatedDir, {
      recursive: true,
    });

    expect(loggerMocks.log).toHaveBeenCalledWith('Deleted shim: /path/to/shim1');
    expect(loggerMocks.log).toHaveBeenCalledWith('Deleted shell init file: /path/to/shell/init.sh');
    expect(loggerMocks.log).toHaveBeenCalledWith('Deleted symlink: /dest/sym1');
    expect(loggerMocks.log).toHaveBeenCalledWith(
      `Successfully deleted manifest file: ${mockAppConfig.manifestPath}`
    );
  });

  test('--all-generated is true, manifest not found', async () => {
    mockFsExists.mockImplementation(async (path: string) => {
      if (path === mockAppConfig.manifestPath) return false; 
      if (path === mockAppConfig.generatedDir) return true; 
      return false;
    });

    const services: CleanupCommandServices = {
      appConfig: mockAppConfig,
      fileSystem: mockFileSystem,
      clientLogger: mockClientLogger,
    };
    const options: CleanupCommandOptions = { allGenerated: true };

    await cleanupActionLogic(options, services);

    expect(mockFileSystem.exists).toHaveBeenCalledWith(mockAppConfig.manifestPath);
    expect(mockFileSystem.readFile).not.toHaveBeenCalled();
    expect(mockFileSystem.rm).toHaveBeenCalledWith(mockAppConfig.generatedDir, { recursive: true });
    expect(loggerMocks.log).toHaveBeenCalledWith(
      `Successfully removed generated directory: ${mockAppConfig.generatedDir}`
    );
    expect(loggerMocks.log).not.toHaveBeenCalledWith(expect.stringContaining('Deleted shim:'));
  });

  test('--all-generated is true, manifest found and processed', async () => {
    const manifest: GeneratedArtifactsManifest = {
      lastGenerated: new Date().toISOString(),
      shims: ['/path/to/unique/shim'],
      shellInit: { path: '/path/to/unique/shell/init.sh' },
      symlinks: [{ sourcePath: '/src/unique', targetPath: '/dest/unique', status: 'created' }],
    };
    mockFsExists.mockImplementation(async (path: string) => {
      if (path === mockAppConfig.manifestPath) return true;
      if (manifest.shims?.includes(path)) return true;
      if (path === manifest.shellInit?.path) return true;
      if (manifest.symlinks?.find((s) => s.targetPath === path)) return true;
      if (path === mockAppConfig.generatedDir) return true;
      return false;
    });
    mockFsReadFile.mockResolvedValue(JSON.stringify(manifest));

    const services: CleanupCommandServices = {
      appConfig: mockAppConfig,
      fileSystem: mockFileSystem,
      clientLogger: mockClientLogger,
    };
    const options: CleanupCommandOptions = { allGenerated: true };

    await cleanupActionLogic(options, services);

    expect(mockFileSystem.rm).toHaveBeenCalledWith('/path/to/unique/shim');
    expect(mockFileSystem.rm).toHaveBeenCalledWith('/path/to/unique/shell/init.sh');
    expect(mockFileSystem.rm).toHaveBeenCalledWith('/dest/unique');
    expect(mockFileSystem.rm).toHaveBeenCalledWith(mockAppConfig.manifestPath);
    expect(mockFileSystem.rm).toHaveBeenCalledWith(mockAppConfig.generatedDir, { recursive: true });

    expect(loggerMocks.log).toHaveBeenCalledWith('Deleted shim: /path/to/unique/shim');
    expect(loggerMocks.log).toHaveBeenCalledWith(
      `Successfully removed generated directory: ${mockAppConfig.generatedDir}`
    );
  });

  test('shell init path in manifest is null', async () => {
    const manifest: GeneratedArtifactsManifest = {
      lastGenerated: new Date().toISOString(),
      shellInit: { path: null },
    };
    mockFsExists.mockImplementation(async (path: string) => path === mockAppConfig.manifestPath);
    mockFsReadFile.mockResolvedValue(JSON.stringify(manifest));

    const services: CleanupCommandServices = {
      appConfig: mockAppConfig,
      fileSystem: mockFileSystem,
      clientLogger: mockClientLogger,
    };
    const options: CleanupCommandOptions = { allGenerated: false };

    await cleanupActionLogic(options, services);

    expect(mockFileSystem.rm).not.toHaveBeenCalledWith(null);
    expect(loggerMocks.debug).toHaveBeenCalledWith('No shell init file path in manifest or path is null.');
    expect(mockFileSystem.rm).toHaveBeenCalledWith(mockAppConfig.manifestPath);
  });

  test('manifest read error, --all-generated is false', async () => {
    mockFsExists.mockResolvedValue(true); 
    mockFsReadFile.mockRejectedValue(new Error('Read failed'));

    const services: CleanupCommandServices = {
      appConfig: mockAppConfig,
      fileSystem: mockFileSystem,
      clientLogger: mockClientLogger,
    };
    const options: CleanupCommandOptions = { allGenerated: false };

    await cleanupActionLogic(options, services);

    expect(loggerMocks.warn).toHaveBeenCalledWith(
      `Could not read or parse manifest at ${mockAppConfig.manifestPath}: Read failed`
    );
    expect(loggerMocks.info).toHaveBeenCalledWith(
      'Manifest not found and --all-generated flag not used. Nothing to clean based on manifest.'
    );
    expect(mockFileSystem.rm).not.toHaveBeenCalledWith(mockAppConfig.manifestPath);
    expect(mockFileSystem.rm).not.toHaveBeenCalledWith(mockAppConfig.generatedDir, {
      recursive: true,
    });
  });

  test('manifest read error, --all-generated is true', async () => {
    mockFsExists.mockImplementation(async (path: string) => {
      if (path === mockAppConfig.manifestPath) return true; 
      if (path === mockAppConfig.generatedDir) return true; 
      return false;
    });
    mockFsReadFile.mockRejectedValue(new Error('Read failed'));

    const services: CleanupCommandServices = {
      appConfig: mockAppConfig,
      fileSystem: mockFileSystem,
      clientLogger: mockClientLogger,
    };
    const options: CleanupCommandOptions = { allGenerated: true };

    await cleanupActionLogic(options, services);

    expect(loggerMocks.warn).toHaveBeenCalledWith(
      `Could not read or parse manifest at ${mockAppConfig.manifestPath}: Read failed`
    );
    expect(mockFileSystem.rm).toHaveBeenCalledWith(mockAppConfig.generatedDir, { recursive: true });
    expect(loggerMocks.log).toHaveBeenCalledWith(
      `Successfully removed generated directory: ${mockAppConfig.generatedDir}`
    );
    expect(mockFileSystem.rm).not.toHaveBeenCalledWith(mockAppConfig.manifestPath);
  });

  test('shim/symlink/shellInit file does not exist on filesystem during cleanup', async () => {
    const manifest: GeneratedArtifactsManifest = {
      lastGenerated: new Date().toISOString(),
      shims: ['/non/existent/shim'],
      shellInit: { path: '/non/existent/init.sh' },
      symlinks: [
        { sourcePath: '/src/non', targetPath: '/dest/non_existent_symlink', status: 'created' },
      ],
    };
    mockFsExists.mockImplementation(async (path: string) => path === mockAppConfig.manifestPath);
    mockFsReadFile.mockResolvedValue(JSON.stringify(manifest));

    const services: CleanupCommandServices = {
      appConfig: mockAppConfig,
      fileSystem: mockFileSystem,
      clientLogger: mockClientLogger,
    };
    const options: CleanupCommandOptions = { allGenerated: false };

    await cleanupActionLogic(options, services);

    expect(mockFileSystem.rm).not.toHaveBeenCalledWith('/non/existent/shim');
    expect(loggerMocks.debug).toHaveBeenCalledWith('Shim not found, skipping: /non/existent/shim');

    expect(mockFileSystem.rm).not.toHaveBeenCalledWith('/non/existent/init.sh');
    expect(loggerMocks.debug).toHaveBeenCalledWith(
      'Shell init file not found, skipping: /non/existent/init.sh'
    );

    expect(mockFileSystem.rm).not.toHaveBeenCalledWith('/dest/non_existent_symlink');
    expect(loggerMocks.debug).toHaveBeenCalledWith(
      'Symlink not found, skipping: /dest/non_existent_symlink'
    );

    expect(mockFileSystem.rm).toHaveBeenCalledWith(mockAppConfig.manifestPath);
  });
});
