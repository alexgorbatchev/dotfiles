import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from './utils';

/**
 * File system operations (read, write, symlinks, permissions)
 */
export const fsErrorTemplates = {
  notFound: (itemType: string, path: string): SafeLogMessage => 
    createSafeLogMessage(`${itemType} not found: ${path}`),
  accessDenied: (operation: string, path: string): SafeLogMessage => 
    createSafeLogMessage(`Access denied ${operation}: ${path}`),
  readFailed: (path: string, reason: string): SafeLogMessage => 
    createSafeLogMessage(`Failed to read ${path}: ${reason}`),
  writeFailed: (path: string, reason: string): SafeLogMessage => 
    createSafeLogMessage(`Failed to write ${path}: ${reason}`),
  symlinkFailed: (source: string, target: string, reason: string): SafeLogMessage => 
    createSafeLogMessage(`Failed to create symlink ${source} → ${target}: ${reason}`),
  symlinkCorrupted: (target: string, expected: string, actual: string): SafeLogMessage => 
    createSafeLogMessage(`Symlink ${target} points to "${actual}", expected "${expected}"`),
  permissionsFailed: (path: string, permissions: string, reason: string): SafeLogMessage => 
    createSafeLogMessage(`Failed to set permissions ${permissions} on ${path}: ${reason}`),
  directoryCreateFailed: (path: string, reason: string): SafeLogMessage => 
    createSafeLogMessage(`Failed to create directory ${path}: ${reason}`),
  deleteFailed: (path: string, reason: string): SafeLogMessage => 
    createSafeLogMessage(`Failed to delete ${path}: ${reason}`),
} as const;