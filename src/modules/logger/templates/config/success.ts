import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const configSuccessTemplates = {
  loaded: (configPath: string, toolCount: number): SafeLogMessage => 
    createSafeLogMessage(`Configuration loaded from ${configPath} (${toolCount} tools configured)`),
  validated: (configPath: string): SafeLogMessage => 
    createSafeLogMessage(`Configuration validated successfully: ${configPath}`),
  platformOverrides: (platform: string, arch: string): SafeLogMessage => 
    createSafeLogMessage(`platform overrides: ${platform} ${arch}`),
  configProcessing: (): SafeLogMessage => 
    createSafeLogMessage('config processing'),
  toolConfigLoading: (toolConfigsDir: string): SafeLogMessage => 
    createSafeLogMessage(`tool config loading: ${toolConfigsDir}`),
  directoryScan: (toolConfigsDir: string): SafeLogMessage => 
    createSafeLogMessage(`directory scan: ${toolConfigsDir}`),
  toolConfigLoad: (filePath: string): SafeLogMessage => 
    createSafeLogMessage(`tool config load: ${filePath}`),
  singleToolConfigLoad: (toolName: string, toolConfigsDir: string): SafeLogMessage => 
    createSafeLogMessage(`single tool config load: ${toolName} in ${toolConfigsDir}`),
} as const;