import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const cargoClientErrorTemplates = {
  emptyResponse: () => createSafeLogMessage('Empty response received from: %s'),
  networkFailure: () => createSafeLogMessage('Network failure while requesting: %s'),
} satisfies SafeLogMessageMap;
