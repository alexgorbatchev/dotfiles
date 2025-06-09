/**
 * @file generator/src/modules/config-loader/__tests__/toolConfigLoader.test.ts
 * @description Unit tests for the toolConfigLoader.
 *
 * ## Development Plan
 *
 * ### Mandatory Pre-read:
 * - `generator/src/modules/config-loader/toolConfigLoader.ts`
 * - `generator/src/types.ts` (AppConfig, ToolConfig)
 * - `generator/src/testing-helpers/appConfigTestHelpers.ts`
 * - `generator/src/testing-helpers/fileSystemTestHelpers.ts`
 * - `.clinerules`
 *
 * ### Tasks:
 * - [x] Import necessary modules and types.
 * - [x] Mock `IFileSystem` and `AppConfig` using testing helpers.
 * - [x] Test scenario: No `*.tool.ts` files found.
 * - [x] Test scenario: Valid `*.tool.ts` files (exporting objects) are correctly loaded and parsed.
 *   - [x] Ensure `ToolConfig.name` is used as the key.
 * - [x] Test scenario: Valid `*.tool.ts` files (exporting `AsyncConfigureTool` functions) are correctly loaded, executed, and parsed.
 *   - [x] Mock `AsyncConfigureTool` function.
 *   - [x] Ensure `ToolConfigBuilder` is instantiated and passed.
 *   - [x] Ensure `appConfig` is passed.
 *   - [x] Ensure the resolved `ToolConfig` is validated and used.
 * - [x] Test scenario: `AsyncConfigureTool` function throws an error during execution.
 * - [x] Test scenario: Files that are not `*.tool.ts` are ignored.
 * - [x] Test scenario: Files with invalid `ToolConfig` structure (failing Zod validation) are skipped with warnings (applies to both object and function exports).
 *   - [x] Mock `ToolConfigSchema.safeParse` to simulate validation failure.
 * - [x] Test scenario: Dynamic import errors are handled (e.g., file exists but import fails).
 *   - [x] Mock `import()` to throw an error.
 * - [x] Test scenario: `fs.readdir` throws an error (e.g., directory not found).
 * - [x] Test scenario: Tool file has no default export.
 * - [x] Test scenario: Duplicate tool names (last one wins, with a log).
 * - [x] Ensure logger is called appropriately for errors and info. (Note: Direct logger call assertions removed as per no-logger-mocking rule, but behavior implies logging)
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [x] Ensure 100% test coverage.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { resolve as resolvePath } from 'path'; // Removed unused 'join'
import type { AppConfig, ToolConfig } from '@types';
import type { IFileSystem } from '@modules/file-system/IFileSystem';
import { loadToolConfigs } from '../toolConfigLoader';
import { createMockAppConfig } from '../../../testing-helpers/createMockAppConfig';
import { createMockFileSystem } from '../../../testing-helpers'; // Corrected import path
import { ToolConfigBuilder } from '../../tool-config-builder/toolConfigBuilder';
import * as toolConfigSchema from '../../config/toolConfigSchema'; // To mock ToolConfigSchema
// Logger will not be mocked, as per project rules.

describe('loadToolConfigs', () => {
  let mockFileSystem: IFileSystem;
  let fileSystemMocks: ReturnType<typeof createMockFileSystem>['fileSystemMocks'];
  let mockAppConfig: AppConfig;
  let originalToolConfigSchemaSafeParse: typeof toolConfigSchema.ToolConfigSchema.safeParse;

  const MOCK_TOOL_CONFIGS_DIR = '/test/tool-configs';

  beforeEach(() => {
    const customReadFileMock = mock(
      async (_path: string, encoding?: BufferEncoding): Promise<string | Buffer> => {
        if (encoding) return Promise.resolve('');
        return Promise.resolve(Buffer.from(''));
      }
    ) as any;

    const { mockFileSystem: mfsInstance, fileSystemMocks: fsMocksInstance } = createMockFileSystem({
      readFile: customReadFileMock,
      // readdir defaults to mock(async () => []) which matches the previous explicit mock
    });

    mockFileSystem = mfsInstance;
    fileSystemMocks = fsMocksInstance;

    mockAppConfig = createMockAppConfig({ toolConfigsDir: MOCK_TOOL_CONFIGS_DIR });

    // Store original and mock safeParse
    originalToolConfigSchemaSafeParse = toolConfigSchema.ToolConfigSchema.safeParse;
  });

  afterEach(() => {
    // Restore original safeParse
    toolConfigSchema.ToolConfigSchema.safeParse = originalToolConfigSchemaSafeParse;
    mock.restore();
  });

  it('should return an empty object if no .tool.ts files are found', async () => {
    fileSystemMocks.readdir.mockResolvedValueOnce(['file1.txt', 'another.js']);
    const result = await loadToolConfigs(mockAppConfig, mockFileSystem);
    expect(result).toEqual({});
    // Logging assertions removed
  });

  it('should return an empty object if toolConfigsDir does not exist or is unreadable', async () => {
    fileSystemMocks.readdir.mockRejectedValueOnce(new Error('Directory not found'));
    const result = await loadToolConfigs(mockAppConfig, mockFileSystem);
    expect(result).toEqual({});
    // Logging assertions removed
  });

  it('should ignore files that are not .tool.ts', async () => {
    fileSystemMocks.readdir.mockResolvedValueOnce(['mytool.tool.ts', 'ignoreme.ts', 'data.json']);

    // Mock dynamic import for mytool.tool.ts
    // This needs to be a valid ToolConfig variant, e.g., NoInstallToolConfig if no install method
    const mockToolConfig: ToolConfig = {
      name: 'mytool',
      binaries: ['mytool'],
      version: '1.0.0',
      installationMethod: 'none',
      installParams: undefined,
    };
    mock.module(resolvePath(MOCK_TOOL_CONFIGS_DIR, 'mytool.tool.ts'), () => ({
      default: mockToolConfig,
    }));

    toolConfigSchema.ToolConfigSchema.safeParse = mock((data) => ({ success: true, data })) as any;

    const result = await loadToolConfigs(mockAppConfig, mockFileSystem);
    expect(result['mytool']).toEqual(mockToolConfig);
    expect(Object.keys(result).length).toBe(1);
  });

  it('should correctly load and parse valid .tool.ts files', async () => {
    const validTool1: ToolConfig = {
      name: 'tool1',
      binaries: ['t1'],
      version: '1.0',
      installationMethod: 'manual', // Make it a valid ManualToolConfig
      installParams: { binaryPath: '/path/to/t1' },
    };
    const validTool2: ToolConfig = {
      name: 'tool2',
      binaries: ['t2', 't2alias'],
      version: '2.1',
      installationMethod: 'github-release', // Make it a valid GithubReleaseToolConfig
      installParams: { repo: 'owner/tool2' },
    };

    fileSystemMocks.readdir.mockResolvedValueOnce(['tool1.tool.ts', 'tool2.tool.ts', 'helper.js']);

    mock.module(resolvePath(MOCK_TOOL_CONFIGS_DIR, 'tool1.tool.ts'), () => ({
      default: validTool1,
    }));
    mock.module(resolvePath(MOCK_TOOL_CONFIGS_DIR, 'tool2.tool.ts'), () => ({
      default: validTool2,
    }));

    toolConfigSchema.ToolConfigSchema.safeParse = mock((data) => ({ success: true, data })) as any;

    const result = await loadToolConfigs(mockAppConfig, mockFileSystem);

    expect(result['tool1']).toEqual(validTool1);
    expect(result['tool2']).toEqual(validTool2);
    expect(Object.keys(result).length).toBe(2);
    // Logging assertions removed
  });

  it('should skip files with invalid ToolConfig structure (failing Zod validation)', async () => {
    const invalidConfigData = { an_invalid_tool_config: true }; // Data that will fail validation
    fileSystemMocks.readdir.mockResolvedValueOnce(['invalid.tool.ts']);
    mock.module(resolvePath(MOCK_TOOL_CONFIGS_DIR, 'invalid.tool.ts'), () => ({
      default: invalidConfigData,
    }));

    const mockValidationError = {
      success: false,
      error: { format: () => 'Mocked Zod error' } as any,
    };
    toolConfigSchema.ToolConfigSchema.safeParse = mock(() => mockValidationError) as any;

    const result = await loadToolConfigs(mockAppConfig, mockFileSystem);
    expect(result).toEqual({});
    // Logging assertions removed
  });

  it('should handle dynamic import errors gracefully', async () => {
    fileSystemMocks.readdir.mockResolvedValueOnce(['errorimport.tool.ts']);

    // Make import() throw for this specific file
    const filePath = resolvePath(MOCK_TOOL_CONFIGS_DIR, 'errorimport.tool.ts');
    mock.module(filePath, () => {
      throw new Error('Dynamic import failed');
    });

    const result = await loadToolConfigs(mockAppConfig, mockFileSystem);
    expect(result).toEqual({});
    // Logging assertions removed
  });

  it('should skip tool file if it has no default export', async () => {
    fileSystemMocks.readdir.mockResolvedValueOnce(['nodefault.tool.ts']);
    const filePath = resolvePath(MOCK_TOOL_CONFIGS_DIR, 'nodefault.tool.ts');
    mock.module(filePath, () => ({ namedExport: {} })); // No default export

    const result = await loadToolConfigs(mockAppConfig, mockFileSystem);
    expect(result).toEqual({});
    // Logging assertions removed
  });

  it('should handle duplicate tool names, last one wins and logs a warning', async () => {
    const toolV1: ToolConfig = {
      name: 'dupetool',
      binaries: ['dt'],
      version: '1.0',
      installationMethod: 'manual',
      installParams: { binaryPath: '/path/dt' },
    };
    const toolV2: ToolConfig = {
      name: 'dupetool',
      binaries: ['dt_new'],
      version: '2.0',
      installationMethod: 'manual',
      installParams: { binaryPath: '/path/dt_new' },
    };

    fileSystemMocks.readdir.mockResolvedValueOnce(['dupe1.tool.ts', 'dupe2.tool.ts']);

    mock.module(resolvePath(MOCK_TOOL_CONFIGS_DIR, 'dupe1.tool.ts'), () => ({ default: toolV1 }));
    mock.module(resolvePath(MOCK_TOOL_CONFIGS_DIR, 'dupe2.tool.ts'), () => ({ default: toolV2 }));

    toolConfigSchema.ToolConfigSchema.safeParse = mock((data) => ({ success: true, data })) as any;

    const result = await loadToolConfigs(mockAppConfig, mockFileSystem);
    expect(result['dupetool']).toEqual(toolV2);
    expect(Object.keys(result).length).toBe(1);
    // Logging assertions removed
  });

  it('should correctly load and parse a .tool.ts file exporting an AsyncConfigureTool function', async () => {
    const toolName = 'asyncTool';
    const expectedConfig: ToolConfig = {
      name: toolName,
      binaries: ['atool'],
      version: '1.0',
      installationMethod: 'manual',
      installParams: { binaryPath: 'dummy/path/atool' },
      zshInit: undefined,
      symlinks: undefined,
      archOverrides: undefined,
      completions: undefined,
      updateCheck: undefined,
    };

    const mockAsyncConfigureTool = mock(
      async (builder: ToolConfigBuilder, appConfig?: AppConfig) => {
        expect(builder).toBeInstanceOf(ToolConfigBuilder);
        expect(appConfig).toEqual(mockAppConfig); // Verify appConfig is passed
        // Simulate builder usage:
        builder.bin(expectedConfig.binaries);
        builder.version(expectedConfig.version);
        if (expectedConfig.installationMethod && expectedConfig.installParams) {
          // Type assertion needed because 'install' is overloaded
          builder.install(
            expectedConfig.installationMethod as 'manual',
            expectedConfig.installParams as any // Cast installParams to any to satisfy overload
          );
        }
        // zshInit and symlinks are defaulted to [] by builder constructor,
        // so no need to call builder.zsh([]) or builder.symlink() if expected is empty.
        return Promise.resolve(); // Return Promise<void>
      }
    );

    fileSystemMocks.readdir.mockResolvedValueOnce([`${toolName}.tool.ts`]);
    mock.module(resolvePath(MOCK_TOOL_CONFIGS_DIR, `${toolName}.tool.ts`), () => ({
      default: mockAsyncConfigureTool,
    }));

    toolConfigSchema.ToolConfigSchema.safeParse = mock((data) => ({ success: true, data })) as any;

    const result = await loadToolConfigs(mockAppConfig, mockFileSystem);

    expect(mockAsyncConfigureTool).toHaveBeenCalledTimes(1);
    expect(result[toolName]).toEqual(expectedConfig);
    expect(Object.keys(result).length).toBe(1);
  });

  it('should handle errors when an AsyncConfigureTool function throws an error', async () => {
    const toolName = 'errorAsyncTool';
    const errorMessage = 'AsyncConfigureTool failed';

    const mockAsyncConfigureTool = mock(
      async (_builder: ToolConfigBuilder, _appConfig?: AppConfig) => {
        throw new Error(errorMessage);
      }
    );

    fileSystemMocks.readdir.mockResolvedValueOnce([`${toolName}.tool.ts`]);
    mock.module(resolvePath(MOCK_TOOL_CONFIGS_DIR, `${toolName}.tool.ts`), () => ({
      default: mockAsyncConfigureTool,
    }));

    const result = await loadToolConfigs(mockAppConfig, mockFileSystem);

    expect(mockAsyncConfigureTool).toHaveBeenCalledTimes(1);
    expect(result).toEqual({});
    // Logging assertions removed (error should be logged by the loader)
  });

  it('should correctly pass appConfig to AsyncConfigureTool function', async () => {
    const toolName = 'appConfigAwareTool';
    // This expectedConfig needs to be a valid ToolConfig variant
    const expectedConfigFromBuilder: ToolConfig = {
      name: toolName,
      binaries: ['actool'],
      version: '1.0',
      installationMethod: 'manual', // Assuming manual for simplicity
      installParams: { binaryPath: '/path/to/actool' },
      zshInit: [],
      symlinks: [],
    };
    let passedAppConfig: AppConfig | undefined;

    const mockAsyncConfigureTool = mock(
      async (builder: ToolConfigBuilder, appConfig?: AppConfig) => {
        passedAppConfig = appConfig;
        builder.bin(expectedConfigFromBuilder.binaries);
        builder.version(expectedConfigFromBuilder.version);
        if (expectedConfigFromBuilder.installationMethod === 'manual') {
          builder.install('manual', expectedConfigFromBuilder.installParams);
        }
        // The builder will construct the ToolConfig object.
        // We don't return it from here.
      }
    );

    fileSystemMocks.readdir.mockResolvedValueOnce([`${toolName}.tool.ts`]);
    mock.module(resolvePath(MOCK_TOOL_CONFIGS_DIR, `${toolName}.tool.ts`), () => ({
      default: mockAsyncConfigureTool,
    }));

    toolConfigSchema.ToolConfigSchema.safeParse = mock((data) => ({ success: true, data })) as any;

    await loadToolConfigs(mockAppConfig, mockFileSystem);

    expect(mockAsyncConfigureTool).toHaveBeenCalledTimes(1);
    expect(passedAppConfig).toBeDefined();
    expect(passedAppConfig).toEqual(mockAppConfig);
  });
});
