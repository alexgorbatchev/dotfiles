import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const commandErrorTemplates = {
  executionFailed: (command: string, exitCode: number, stderr: string) => 
    createSafeLogMessage(`Command failed [${command}] exit ${exitCode}: ${stderr}`),
  notFound: (command: string) => 
    createSafeLogMessage(`Command not found: ${command}`),
  permissionDenied: (command: string) => 
    createSafeLogMessage(`Permission denied executing: ${command}`),
  invalidArgs: (command: string, provided: string, expected: string) => 
    createSafeLogMessage(`Invalid arguments for ${command}: provided "${provided}", expected ${expected}`),
  timeout: (command: string, timeoutMs: number) => 
    createSafeLogMessage(`Command timed out [${command}] after ${timeoutMs}ms`),
  interruptedByUser: (command: string) => 
    createSafeLogMessage(`Command interrupted by user: ${command}`),
} satisfies SafeLogMessageMap;