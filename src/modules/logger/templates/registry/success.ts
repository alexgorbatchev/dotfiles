import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const registrySuccessTemplates = {
  initialized: (path: string): SafeLogMessage => createSafeLogMessage(`File tracking initialized: ${path}`),
  operationsTracked: (count: number, toolName: string): SafeLogMessage => createSafeLogMessage(`Tracked ${count} file operations for ${toolName}`),
  summaryStats: (totalFiles: number, totalTools: number): SafeLogMessage => createSafeLogMessage(`Registry contains ${totalFiles} files across ${totalTools} tools`),
} as const;