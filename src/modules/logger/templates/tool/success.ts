import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const toolSuccessTemplates = {
  installed: (toolName: string, version: string, method: string) => 
    createSafeLogMessage(`Tool "${toolName}" v${version} installed successfully using ${method}`),
  updated: (toolName: string, fromVersion: string, toVersion: string) => 
    createSafeLogMessage(`Tool "${toolName}" updated from v${fromVersion} to v${toVersion}`),
  removed: (toolName: string) => 
    createSafeLogMessage(`Tool "${toolName}" removed successfully`),
  processing: (toolName: string, operation: string) => 
    createSafeLogMessage(`Processing ${toolName} (${operation})`),
  processingComplete: (toolName: string, operation: string, duration?: number) => 
    createSafeLogMessage(`Completed ${toolName} (${operation})${duration ? ` in ${duration}ms` : ''}`),
} satisfies SafeLogMessageMap;