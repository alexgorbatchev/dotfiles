import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from './utils';

export const toolSuccessTemplates = {
  installed: (toolName: string, version: string, method: string): SafeLogMessage => 
    createSafeLogMessage(`Tool "${toolName}" v${version} installed successfully using ${method}`),
  updated: (toolName: string, fromVersion: string, toVersion: string): SafeLogMessage => 
    createSafeLogMessage(`Tool "${toolName}" updated from v${fromVersion} to v${toVersion}`),
  removed: (toolName: string): SafeLogMessage => 
    createSafeLogMessage(`Tool "${toolName}" removed successfully`),
  processing: (toolName: string, operation: string): SafeLogMessage => 
    createSafeLogMessage(`Processing ${toolName} (${operation})`),
  processingComplete: (toolName: string, operation: string, duration?: number): SafeLogMessage => 
    createSafeLogMessage(`Completed ${toolName} (${operation})${duration ? ` in ${duration}ms` : ''}`),
} as const;