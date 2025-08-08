import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const fsWarningTemplates = {
  overwriting: (toolName: string, path: string): SafeLogMessage => 
    createSafeLogMessage(`[${toolName}] Overwrote: ${path}`),
  permissionsFixed: (path: string, newPermissions: string): SafeLogMessage => 
    createSafeLogMessage(`Fixed permissions on ${path} to ${newPermissions}`),
  readFailed: (path: string, reason: string): SafeLogMessage => 
    createSafeLogMessage(`Failed to read ${path}: ${reason}`),
  notFound: (itemType: string, path: string): SafeLogMessage => 
    createSafeLogMessage(`${itemType} not found: ${path}`),
} as const;