import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const configSuccessTemplates = {
  loaded: (configPath: string, toolCount: number) =>
    createSafeLogMessage(`Configuration loaded from ${configPath} (${toolCount} tools configured)`),
  validated: (configPath: string) => createSafeLogMessage(`Configuration validated successfully: ${configPath}`),
  platformOverrides: (platform: string, arch: string) =>
    createSafeLogMessage(`platform overrides: ${platform} ${arch}`),
  configProcessing: () => createSafeLogMessage('config processing'),
  toolConfigLoading: (toolConfigsDir: string) => createSafeLogMessage(`tool config loading: ${toolConfigsDir}`),
  directoryScan: (toolConfigsDir: string) => createSafeLogMessage(`directory scan: ${toolConfigsDir}`),
  toolConfigLoad: (filePath: string) => createSafeLogMessage(`tool config load: ${filePath}`),
  singleToolConfigLoad: (toolName: string, toolConfigsDir: string) =>
    createSafeLogMessage(`single tool config load: ${toolName} in ${toolConfigsDir}`),
} satisfies SafeLogMessageMap;
