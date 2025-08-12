import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const fsErrorTemplates = {
  notFound: (itemType: string, path: string) => createSafeLogMessage(`${itemType} not found: ${path}`),
  accessDenied: (operation: string, path: string) => createSafeLogMessage(`Access denied ${operation}: ${path}`),
  readFailed: (path: string, reason: string) => createSafeLogMessage(`Failed to read ${path}: ${reason}`),
  writeFailed: (path: string, reason: string) => createSafeLogMessage(`Failed to write ${path}: ${reason}`),
  symlinkFailed: (source: string, target: string, reason: string) =>
    createSafeLogMessage(`Failed to create symlink ${source} → ${target}: ${reason}`),
  symlinkCorrupted: (target: string, expected: string, actual: string) =>
    createSafeLogMessage(`Symlink ${target} points to "${actual}", expected "${expected}"`),
  permissionsFailed: (path: string, permissions: string, reason: string) =>
    createSafeLogMessage(`Failed to set permissions ${permissions} on ${path}: ${reason}`),
  directoryCreateFailed: (path: string, reason: string) =>
    createSafeLogMessage(`Failed to create directory ${path}: ${reason}`),
  deleteFailed: (path: string, reason: string) => createSafeLogMessage(`Failed to delete ${path}: ${reason}`),
} satisfies SafeLogMessageMap;
