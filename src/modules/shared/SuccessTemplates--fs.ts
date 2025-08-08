import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from './utils';

export const fsSuccessTemplates = {
  created: (toolName: string, path: string): SafeLogMessage => createSafeLogMessage(`[${toolName}] write ${path}`),
  updated: (toolName: string, path: string): SafeLogMessage => createSafeLogMessage(`[${toolName}] write ${path}`),
  removed: (toolName: string, path: string): SafeLogMessage => createSafeLogMessage(`[${toolName}] rm ${path}`),
  moved: (toolName: string, oldPath: string, newPath: string): SafeLogMessage => createSafeLogMessage(`[${toolName}] mv ${oldPath} ${newPath}`),
  copied: (toolName: string, srcPath: string, destPath: string): SafeLogMessage => createSafeLogMessage(`[${toolName}] cp ${srcPath} ${destPath}`),
  symlinkCreated: (toolName: string, linkPath: string, targetPath: string): SafeLogMessage => createSafeLogMessage(`[${toolName}] ln -s ${targetPath} ${linkPath}`),
  permissionsChanged: (toolName: string, path: string, mode: string): SafeLogMessage => createSafeLogMessage(`[${toolName}] chmod ${mode} ${path}`),
  directoryCreated: (toolName: string, path: string): SafeLogMessage => createSafeLogMessage(`[${toolName}] mkdir ${path}`),
} as const;