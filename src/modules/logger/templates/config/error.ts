import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const configErrorTemplates = {
  validationFailed: (errors: string[]): SafeLogMessage => 
    createSafeLogMessage(`Configuration validation failed:\n${errors.join('\n')}`),
  loadFailed: (configPath: string, reason: string): SafeLogMessage => 
    createSafeLogMessage(`Failed to load configuration from ${configPath}: ${reason}`),
  required: (field: string, example?: string): SafeLogMessage => 
    createSafeLogMessage(`Required configuration missing: ${field}${example ? `. Example: ${example}` : ''}`),
  invalid: (field: string, value: string, expected: string): SafeLogMessage => 
    createSafeLogMessage(`Invalid ${field}: "${value}" (expected ${expected})`),
  parseErrors: (configPath: string, format: string, reason: string): SafeLogMessage => 
    createSafeLogMessage(`Failed to parse ${format} configuration ${configPath}: ${reason}`),
  schemaError: (field: string, issue: string): SafeLogMessage => 
    createSafeLogMessage(`Configuration schema error in ${field}: ${issue}`),
} as const;