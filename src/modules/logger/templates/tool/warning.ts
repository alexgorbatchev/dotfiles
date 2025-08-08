import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const toolWarningTemplates = {
  alreadyInstalled: (toolName: string, version: string): SafeLogMessage => 
    createSafeLogMessage(`Tool "${toolName}" version ${version} is already installed`),
  outdatedVersion: (toolName: string, current: string, latest: string): SafeLogMessage => 
    createSafeLogMessage(`Tool "${toolName}" version ${current} is outdated (latest: ${latest})`),
  unusedTool: (toolName: string, lastUsed: string): SafeLogMessage => 
    createSafeLogMessage(`Tool "${toolName}" hasn't been used since ${lastUsed}`),
  versionComparisonFailed: (toolName: string, current: string, latest: string): SafeLogMessage => 
    createSafeLogMessage(`Could not determine update status for ${toolName} (${current}) against latest ${latest}`),
  conflictsDetected: (header: string, conflicts: string): SafeLogMessage => 
    createSafeLogMessage(`${header}\n${conflicts}`),
} as const;