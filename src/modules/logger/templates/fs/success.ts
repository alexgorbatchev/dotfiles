import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const fsSuccessTemplates = {
  created: (toolName: string, path: string) => createSafeLogMessage(`[${toolName}] write ${path}`),
  updated: (toolName: string, path: string) => createSafeLogMessage(`[${toolName}] write ${path}`),
  removed: (toolName: string, path: string) => createSafeLogMessage(`[${toolName}] rm ${path}`),
  moved: (toolName: string, oldPath: string, newPath: string) => createSafeLogMessage(`[${toolName}] mv ${oldPath} ${newPath}`),
  copied: (toolName: string, srcPath: string, destPath: string) => createSafeLogMessage(`[${toolName}] cp ${srcPath} ${destPath}`),
  symlinkCreated: (toolName: string, linkPath: string, targetPath: string) => createSafeLogMessage(`[${toolName}] ln -s ${targetPath} ${linkPath}`),
  permissionsChanged: (toolName: string, path: string, mode: string) => createSafeLogMessage(`[${toolName}] chmod ${mode} ${path}`),
  directoryCreated: (toolName: string, path: string) => createSafeLogMessage(`[${toolName}] mkdir ${path}`),
} satisfies SafeLogMessageMap;