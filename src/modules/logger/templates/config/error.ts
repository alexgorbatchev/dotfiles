import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const configErrorTemplates = {
  validationFailed: (errors: string[]) => 
    createSafeLogMessage(`Configuration validation failed:\n${errors.join('\n')}`),
  loadFailed: (configPath: string, reason: string) => 
    createSafeLogMessage(`Failed to load configuration from ${configPath}: ${reason}`),
  required: (field: string, example?: string) => 
    createSafeLogMessage(`Required configuration missing: ${field}${example ? `. Example: ${example}` : ''}`),
  invalid: (field: string, value: string, expected: string) => 
    createSafeLogMessage(`Invalid ${field}: "${value}" (expected ${expected})`),
  parseErrors: (configPath: string, format: string, reason: string) => 
    createSafeLogMessage(`Failed to parse ${format} configuration ${configPath}: ${reason}`),
  schemaError: (field: string, issue: string) => 
    createSafeLogMessage(`Configuration schema error in ${field}: ${issue}`),
} satisfies SafeLogMessageMap;