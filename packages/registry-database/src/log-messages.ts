import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  initialized: () => createSafeLogMessage('Initialized SQLite file registry at: %s'),
} satisfies SafeLogMessageMap;
