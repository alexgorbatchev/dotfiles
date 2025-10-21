import { createSafeLogMessage, type SafeLogMessageMap } from '@modules/logger';

export const toolConfigBuilderLogMessages = {
  configurationFieldIgnored: (field: string, reason: string) =>
    createSafeLogMessage(`Configuration field "${field}" ignored: ${reason}`),
  configurationFieldRequired: (field: string, example?: string) =>
    createSafeLogMessage(`Required configuration missing: ${field}${example ? `. Example: ${example}` : ''}`),
  configurationFieldInvalid: (field: string, value: string, expected: string) =>
    createSafeLogMessage(`Invalid ${field}: "${value}" (expected ${expected})`),
} satisfies SafeLogMessageMap;
