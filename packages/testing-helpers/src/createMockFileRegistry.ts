import type { IFileOperation, IFileRegistry, IFileState } from '@dotfiles/registry';
import { mock } from 'bun:test';

/**
 * Input type for setFileState - minimal properties needed to track a file.
 */
export interface ISetFileStateInput {
  /** File path */
  filePath: string;
  /** Tool that owns this file */
  toolName: string;
  /** Type of file */
  fileType: IFileOperation['fileType'];
  /** Target path for symlinks */
  targetPath?: string;
  /** Override the last operation (defaults based on fileType) */
  lastOperation?: IFileOperation['operationType'];
}

/**
 * Mock implementation of IFileRegistry for testing purposes.
 *
 * This mock provides a simple in-memory store for file states that can be
 * pre-populated using `setFileState` and queried via `getFileStatesForTool`.
 */
export interface IMockFileRegistry extends IFileRegistry {
  /**
   * Sets the file state for testing.
   * Use this to pre-populate the registry with states that will be returned
   * by getFileStatesForTool.
   */
  setFileState(state: ISetFileStateInput): void;

  /**
   * Clears all stored file states.
   */
  clearFileStates(): void;
}

/**
 * Creates a mock file registry for testing.
 *
 * The mock stores file states in memory and can be pre-populated using
 * the `setFileState` method. The `getFileStatesForTool` method will return
 * all states that match the given tool name.
 *
 * @returns A mock file registry instance.
 */
export function createMockFileRegistry(): IMockFileRegistry {
  const fileStates: ISetFileStateInput[] = [];

  const setFileState = (state: ISetFileStateInput): void => {
    fileStates.push(state);
  };

  const clearFileStates = (): void => {
    fileStates.length = 0;
  };

  const getFileStatesForTool = mock(async (toolName: string): Promise<IFileState[]> => {
    const states: IFileState[] = fileStates
      .filter((state) => state.toolName === toolName)
      .map((state) => ({
        filePath: state.filePath,
        toolName: state.toolName,
        fileType: state.fileType,
        targetPath: state.targetPath,
        lastOperation: state.lastOperation ??
          (state.fileType === 'symlink' ? 'symlink' as const : 'writeFile' as const),
        lastModified: Date.now(),
      }));
    return states;
  });

  const getRegisteredTools = mock(async (): Promise<string[]> => {
    const tools = new Set<string>();
    for (const state of fileStates) {
      tools.add(state.toolName);
    }
    return Array.from(tools).toSorted();
  });

  const mockRegistry: IMockFileRegistry = {
    recordOperation: mock(async () => {}),
    getOperations: mock(async () => []),
    getFileStatesForTool,
    getFileState: mock(async () => null),
    getRegisteredTools,
    removeToolOperations: mock(async () => {}),
    compact: mock(async () => {}),
    validate: mock(async () => ({ valid: true, issues: [], repaired: [] })),
    getStats: mock(async () => ({
      totalOperations: 0,
      totalFiles: 0,
      totalTools: 0,
      oldestOperation: 0,
      newestOperation: 0,
    })),
    close: mock(async () => {}),
    setFileState,
    clearFileStates,
  };

  return mockRegistry;
}
