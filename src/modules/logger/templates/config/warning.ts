import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const configWarningTemplates = {
  deprecated: (field: string, replacement: string): SafeLogMessage => 
    createSafeLogMessage(`Configuration field "${field}" is deprecated. Use "${replacement}" instead`),
  ignored: (field: string, reason: string): SafeLogMessage => 
    createSafeLogMessage(`Configuration field "${field}" ignored: ${reason}`),
  defaultUsed: (field: string, defaultValue: string): SafeLogMessage => 
    createSafeLogMessage(`Using default value for ${field}: ${defaultValue}`),
  overridden: (field: string, value: string): SafeLogMessage => 
    createSafeLogMessage(`${field.charAt(0).toUpperCase() + field.slice(1)} overridden to: ${value}`),
  invalid: (field: string, value: string, expected: string): SafeLogMessage => 
    createSafeLogMessage(`Invalid ${field}: "${value}" (expected ${expected})`),
} as const;