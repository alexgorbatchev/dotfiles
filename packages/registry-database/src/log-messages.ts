import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  initialized: () => createSafeLogMessage('Initialized SQLite file registry at: %s'),
  sqlitePragmaConfigFailed: () => createSafeLogMessage('Failed to configure SQLite pragmas; continuing with defaults'),
} satisfies SafeLogMessageMap;
