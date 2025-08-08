import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from './utils';

/**
 * Command execution and CLI
 */
export const commandErrorTemplates = {
  executionFailed: (command: string, exitCode: number, stderr: string): SafeLogMessage => 
    createSafeLogMessage(`Command failed [${command}] exit ${exitCode}: ${stderr}`),
  notFound: (command: string): SafeLogMessage => 
    createSafeLogMessage(`Command not found: ${command}`),
  permissionDenied: (command: string): SafeLogMessage => 
    createSafeLogMessage(`Permission denied executing: ${command}`),
  invalidArgs: (command: string, provided: string, expected: string): SafeLogMessage => 
    createSafeLogMessage(`Invalid arguments for ${command}: provided "${provided}", expected ${expected}`),
  timeout: (command: string, timeoutMs: number): SafeLogMessage => 
    createSafeLogMessage(`Command timed out [${command}] after ${timeoutMs}ms`),
  interruptedByUser: (command: string): SafeLogMessage => 
    createSafeLogMessage(`Command interrupted by user: ${command}`),
} as const;