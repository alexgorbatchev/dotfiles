import { createSafeLogMessage, type SafeLogMessageMap } from '@modules/logger';

export const toolInstallationRegistryLogMessages = {
  schemaInitialized: () => createSafeLogMessage('Schema initialization complete'),
  operationRecorded: () => createSafeLogMessage('Recorded %s operation for %s: %s'),
} satisfies SafeLogMessageMap;
