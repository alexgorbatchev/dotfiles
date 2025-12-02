import type { ShellType } from '@dotfiles/core';
import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  generationStarted: (toolName: string, shellType: ShellType) =>
    createSafeLogMessage(`Starting completion generation for "${toolName}" (shell: ${shellType})`),
  generationComplete: (filename: string, toolName: string, shellType: string) =>
    createSafeLogMessage(`Generated completion ${filename} for ${toolName} (${shellType})`),
  commandExecutionStarted: (toolName: string, command: string, shellType: ShellType) =>
    createSafeLogMessage(`Executing completion command for "${toolName}" (shell: ${shellType}): ${command}`),
  commandExecutionFailed: (toolName: string, command: string, exitCode: number, stderr: string) =>
    createSafeLogMessage(`Completion command failed for "${toolName}" [${command}] exit ${exitCode}: ${stderr}`),
  commandExecutionCompleted: (toolName: string, shellType: ShellType) =>
    createSafeLogMessage(`Completion command succeeded for "${toolName}" (shell: ${shellType})`),
} satisfies SafeLogMessageMap;
