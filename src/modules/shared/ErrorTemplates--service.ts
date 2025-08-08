import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from './utils';

/**
 * External service integrations
 */
export const serviceErrorTemplates = {
  github: {
    apiFailed: (operation: string, status: number, message: string): SafeLogMessage => 
      createSafeLogMessage(`GitHub API failed [${operation}] ${status}: ${message}`),
    rateLimited: (resetTime: string): SafeLogMessage => 
      createSafeLogMessage(`GitHub API rate limited. Resets at ${resetTime}`),
    unauthorized: (): SafeLogMessage => createSafeLogMessage('GitHub API authentication failed. Check your token'),
    notFound: (resource: string, identifier: string): SafeLogMessage => 
      createSafeLogMessage(`GitHub ${resource} not found: ${identifier}`),
    networkError: (operation: string, reason: string): SafeLogMessage => 
      createSafeLogMessage(`GitHub API network error [${operation}]: ${reason}`),
    quotaExceeded: (quotaType: string, limit: number): SafeLogMessage => 
      createSafeLogMessage(`GitHub API ${quotaType} quota exceeded (limit: ${limit})`),
  },
  network: {
    downloadFailed: (url: string, reason: string): SafeLogMessage => 
      createSafeLogMessage(`Download failed from ${url}: ${reason}`),
    timeoutExceeded: (operation: string, timeout: number): SafeLogMessage => 
      createSafeLogMessage(`${operation} timed out after ${timeout}ms`),
    connectionFailed: (host: string, reason: string): SafeLogMessage => 
      createSafeLogMessage(`Connection failed to ${host}: ${reason}`),
    invalidUrl: (url: string): SafeLogMessage => 
      createSafeLogMessage(`Invalid URL: ${url}`),
    checksumMismatch: (file: string, expected: string, actual: string): SafeLogMessage => 
      createSafeLogMessage(`Checksum mismatch for ${file}: expected ${expected}, got ${actual}`),
  },
} as const;