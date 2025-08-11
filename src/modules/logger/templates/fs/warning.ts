import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const fsWarningTemplates = {
  overwriting: (toolName: string, path: string) => 
    createSafeLogMessage(`[${toolName}] Overwrote: ${path}`),
  permissionsFixed: (path: string, newPermissions: string) => 
    createSafeLogMessage(`Fixed permissions on ${path} to ${newPermissions}`),
  readFailed: (path: string, reason: string) => 
    createSafeLogMessage(`Failed to read ${path}: ${reason}`),
  notFound: (itemType: string, path: string) => 
    createSafeLogMessage(`${itemType} not found: ${path}`),
} satisfies SafeLogMessageMap;