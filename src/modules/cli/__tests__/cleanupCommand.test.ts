import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import type { AppConfig } from '@modules/config';
import type { IFileSystem } from '@modules/file-system';
import type { ConsolaInstance } from 'consola';
import type { GeneratedArtifactsManifest } from '@types';
import { createMockAppConfig, createMockFileSystem } from '@testing-helpers';
import {
  cleanupActionLogic, // Import the action logic directly
  type CleanupCommandOptions,
  type CleanupCommandServices,
} from '../cleanupCommand';

// Mocks
let mockFileSystem: IFileSystem;
let mockAppConfig: AppConfig;
let mockClientLogger: ConsolaInstance;
// The cleanupAction will now be `cleanupActionLogic` directly

const mockLog = mock(() => {});
const mockInfo = mock(() => {});
const mockWarn = mock(() => {});
const mockError = mock(() => {});
const mockDebug = mock(() => {});

// Mock functions for file system operations
let mockFsExists: import('bun:test').Mock<(...args: any[]) => Promise<boolean>>;
let mockFsReadFile: import('bun:test').Mock<(...args: any[]) => Promise<string>>;
let mockFsRm: import('bun:test').Mock<(...args: any[]) => Promise<void>>;

describe('CLI > commands > cleanup', () => {
  beforeEach(() => {
    // Initialize mock functions for file system
    mockFsExists = mock(async (_path: string) => false);
    mockFsReadFile = mock(async (_path: string, _encoding?: BufferEncoding) => '');
    mockFsRm = mock(async (_path: string, _options?: { recursive?: boolean; force?: boolean }) => {});

    const { mockFileSystem: mfs } = createMockFileSystem({
      exists: mockFsExists,
      readFile: mockFsReadFile,
      rm: mockFsRm,
      // Other IFileSystem methods will use default mocks from createMockFileSystem
    });
    mockFileSystem = mfs;

    mockAppConfig = createMockAppConfig({
      manifestPath: '.generated/tool-manifest.json', // Used by cleanup command for the main manifest
      generatedDir: '.generated/',
      // Other AppConfig properties will use defaults from createMockAppConfig
    });

    mockClientLogger = {
      log: mockLog,
      info: mockInfo,
      warn: mockWarn,
      error: mockError,
      debug: mockDebug,
      // Add other Consola methods if used, with mock implementations
    } as any; // Cast to any to simplify mock type

    // For most tests, we'll call cleanupActionLogic directly.
  });

  afterEach(() => {
    mockLog.mockClear();
    mockInfo.mockClear();
    mockWarn.mockClear();
    mockError.mockClear();
    mockDebug.mockClear();
    mockFsExists.mockClear();
    mockFsReadFile.mockClear();
    mockFsRm.mockClear();
  });

  const defaultServices: CleanupCommandServices = {
    appConfig: {} as AppConfig, // Will be set in tests
    fileSystem: {} as IFileSystem, // Will be set in tests
    clientLogger: {} as ConsolaInstance, // Will be set in tests
  };

  test('manifest not found and --all-generated is false', async () => {
    mockFsExists.mockResolvedValue(false); // Manifest does not exist
    const services = {
      ...defaultServices,
      appConfig: mockAppConfig,
      fileSystem: mockFileSystem,
      clientLogger: mockClientLogger,
    };
    const options: CleanupCommandOptions = { allGenerated: false };

    await cleanupActionLogic(options, services);

    expect(mockFileSystem.exists).toHaveBeenCalledWith(mockAppConfig.manifestPath);
    expect(mockInfo).toHaveBeenCalledWith(
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

    const services = {
      ...defaultServices,
      appConfig: mockAppConfig,
      fileSystem: mockFileSystem,
      clientLogger: mockClientLogger,
    };
    const options: CleanupCommandOptions = { allGenerated: false };

    await cleanupActionLogic(options, services);

    expect(mockFileSystem.readFile).toHaveBeenCalledWith(mockAppConfig.manifestPath, 'utf8');
    // Shims
    expect(mockFileSystem.rm).toHaveBeenCalledWith('/path/to/shim1');
    expect(mockFileSystem.rm).toHaveBeenCalledWith('/path/to/shim2');
    // Shell init
    expect(mockFileSystem.rm).toHaveBeenCalledWith('/path/to/shell/init.sh');
    // Symlinks
    expect(mockFileSystem.rm).toHaveBeenCalledWith('/dest/sym1');
    expect(mockFileSystem.rm).toHaveBeenCalledWith('/dest/sym2');
    // Manifest itself
    expect(mockFileSystem.rm).toHaveBeenCalledWith(mockAppConfig.manifestPath);
    // Generated dir should NOT be removed
    expect(mockFileSystem.rm).not.toHaveBeenCalledWith(mockAppConfig.generatedDir, {
      recursive: true,
    });

    expect(mockLog).toHaveBeenCalledWith('Deleted shim: /path/to/shim1');
    expect(mockLog).toHaveBeenCalledWith('Deleted shell init file: /path/to/shell/init.sh');
    expect(mockLog).toHaveBeenCalledWith('Deleted symlink: /dest/sym1');
    expect(mockLog).toHaveBeenCalledWith(
      `Successfully deleted manifest file: ${mockAppConfig.manifestPath}`
    );
  });

  test('--all-generated is true, manifest not found', async () => {
    mockFsExists.mockImplementation(async (path: string) => {
      if (path === mockAppConfig.manifestPath) return false; // Manifest does not exist
      if (path === mockAppConfig.generatedDir) return true; // Generated dir exists
      return false;
    });

    const services = {
      ...defaultServices,
      appConfig: mockAppConfig,
      fileSystem: mockFileSystem,
      clientLogger: mockClientLogger,
    };
    const options: CleanupCommandOptions = { allGenerated: true };

    await cleanupActionLogic(options, services);

    expect(mockFileSystem.exists).toHaveBeenCalledWith(mockAppConfig.manifestPath);
    expect(mockFileSystem.readFile).not.toHaveBeenCalled(); // Manifest not read
    expect(mockFileSystem.rm).toHaveBeenCalledWith(mockAppConfig.generatedDir, { recursive: true });
    expect(mockLog).toHaveBeenCalledWith(
      `Successfully removed generated directory: ${mockAppConfig.generatedDir}`
    );
    // Manifest specific items should not be processed or logged for deletion
    expect(mockLog).not.toHaveBeenCalledWith(expect.stringContaining('Deleted shim:'));
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

    const services = {
      ...defaultServices,
      appConfig: mockAppConfig,
      fileSystem: mockFileSystem,
      clientLogger: mockClientLogger,
    };
    const options: CleanupCommandOptions = { allGenerated: true };

    await cleanupActionLogic(options, services);

    // Manifest items
    expect(mockFileSystem.rm).toHaveBeenCalledWith('/path/to/unique/shim');
    expect(mockFileSystem.rm).toHaveBeenCalledWith('/path/to/unique/shell/init.sh');
    expect(mockFileSystem.rm).toHaveBeenCalledWith('/dest/unique');
    expect(mockFileSystem.rm).toHaveBeenCalledWith(mockAppConfig.manifestPath);
    // Generated dir
    expect(mockFileSystem.rm).toHaveBeenCalledWith(mockAppConfig.generatedDir, { recursive: true });

    expect(mockLog).toHaveBeenCalledWith('Deleted shim: /path/to/unique/shim');
    expect(mockLog).toHaveBeenCalledWith(
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

    const services = {
      ...defaultServices,
      appConfig: mockAppConfig,
      fileSystem: mockFileSystem,
      clientLogger: mockClientLogger,
    };
    const options: CleanupCommandOptions = { allGenerated: false };

    await cleanupActionLogic(options, services);

    expect(mockFileSystem.rm).not.toHaveBeenCalledWith(null); // Ensure it doesn't try to delete null
    expect(mockDebug).toHaveBeenCalledWith('No shell init file path in manifest or path is null.');
    expect(mockFileSystem.rm).toHaveBeenCalledWith(mockAppConfig.manifestPath); // Manifest itself still deleted
  });

  test('manifest read error, --all-generated is false', async () => {
    mockFsExists.mockResolvedValue(true); // Manifest exists
    mockFsReadFile.mockRejectedValue(new Error('Read failed'));

    const services = {
      ...defaultServices,
      appConfig: mockAppConfig,
      fileSystem: mockFileSystem,
      clientLogger: mockClientLogger,
    };
    const options: CleanupCommandOptions = { allGenerated: false };

    await cleanupActionLogic(options, services);

    expect(mockWarn).toHaveBeenCalledWith(
      `Could not read or parse manifest at ${mockAppConfig.manifestPath}: Read failed`
    );
    expect(mockInfo).toHaveBeenCalledWith(
      'Manifest not found and --all-generated flag not used. Nothing to clean based on manifest.'
    );
    expect(mockFileSystem.rm).not.toHaveBeenCalledWith(mockAppConfig.manifestPath);
    expect(mockFileSystem.rm).not.toHaveBeenCalledWith(mockAppConfig.generatedDir, {
      recursive: true,
    });
  });

  test('manifest read error, --all-generated is true', async () => {
    mockFsExists.mockImplementation(async (path: string) => {
      if (path === mockAppConfig.manifestPath) return true; // Manifest exists
      if (path === mockAppConfig.generatedDir) return true; // Generated dir exists
      return false;
    });
    mockFsReadFile.mockRejectedValue(new Error('Read failed'));

    const services = {
      ...defaultServices,
      appConfig: mockAppConfig,
      fileSystem: mockFileSystem,
      clientLogger: mockClientLogger,
    };
    const options: CleanupCommandOptions = { allGenerated: true };

    await cleanupActionLogic(options, services);

    expect(mockWarn).toHaveBeenCalledWith(
      `Could not read or parse manifest at ${mockAppConfig.manifestPath}: Read failed`
    );
    expect(mockFileSystem.rm).toHaveBeenCalledWith(mockAppConfig.generatedDir, { recursive: true });
    expect(mockLog).toHaveBeenCalledWith(
      `Successfully removed generated directory: ${mockAppConfig.generatedDir}`
    );
    expect(mockFileSystem.rm).not.toHaveBeenCalledWith(mockAppConfig.manifestPath); // Manifest not deleted due to read error
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
    // Manifest itself exists, but its listed files do not
    mockFsExists.mockImplementation(async (path: string) => path === mockAppConfig.manifestPath);
    mockFsReadFile.mockResolvedValue(JSON.stringify(manifest));

    const services = {
      ...defaultServices,
      appConfig: mockAppConfig,
      fileSystem: mockFileSystem,
      clientLogger: mockClientLogger,
    };
    const options: CleanupCommandOptions = { allGenerated: false };

    await cleanupActionLogic(options, services);

    expect(mockFileSystem.rm).not.toHaveBeenCalledWith('/non/existent/shim');
    expect(mockDebug).toHaveBeenCalledWith('Shim not found, skipping: /non/existent/shim');

    expect(mockFileSystem.rm).not.toHaveBeenCalledWith('/non/existent/init.sh');
    expect(mockDebug).toHaveBeenCalledWith(
      'Shell init file not found, skipping: /non/existent/init.sh'
    );

    expect(mockFileSystem.rm).not.toHaveBeenCalledWith('/dest/non_existent_symlink');
    expect(mockDebug).toHaveBeenCalledWith(
      'Symlink not found, skipping: /dest/non_existent_symlink'
    );

    expect(mockFileSystem.rm).toHaveBeenCalledWith(mockAppConfig.manifestPath); // Manifest itself still deleted
  });
});

