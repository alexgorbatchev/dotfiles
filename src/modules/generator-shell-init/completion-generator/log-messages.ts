import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '@modules/logger/utils';
import type { ShellType } from '@types';

export const completionGeneratorLogMessages = {
  generationStarted: (toolName: string, shellType: ShellType) =>
    createSafeLogMessage(`Starting completion generation for "${toolName}" (shell: ${shellType})`),
  commandExecutionStarted: (toolName: string, command: string, shellType: ShellType) =>
    createSafeLogMessage(`Executing completion command for "${toolName}" (shell: ${shellType}): ${command}`),
  commandExecutionFailed: (toolName: string, command: string, exitCode: number, stderr: string) =>
    createSafeLogMessage(
      `Completion command failed for "${toolName}" [${command}] exit ${exitCode}: ${stderr}`
    ),
  commandExecutionCompleted: (toolName: string, shellType: ShellType) =>
    createSafeLogMessage(`Completion command succeeded for "${toolName}" (shell: ${shellType})`),
} satisfies SafeLogMessageMap;
