import type { Shell, ShellCommand, ShellResult } from '@dotfiles/core';
import { mock } from 'bun:test';

/**
 * Mock response for a shell command.
 */
export interface IMockShellResponse {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Mock shell for testing.
 * Allows configuring responses for specific commands.
 */
export interface IMockShell extends Shell {
  /** Configure response for next call */
  mockNextResponse: (response: IMockShellResponse) => void;
  /** Configure response for specific endpoint pattern */
  mockResponseForEndpoint: (endpointPattern: string | RegExp, response: IMockShellResponse) => void;
  /** Clear all mocked responses */
  clearMocks: () => void;
  /** Get all commands that were executed */
  getExecutedCommands: () => string[];
}

/**
 * Creates a mock shell for testing GhCliApiClient.
 *
 * @example
 * ```typescript
 * const mockShell = createMockShell();
 *
 * // Configure response for a specific endpoint
 * mockShell.mockResponseForEndpoint(/releases\/latest/, {
 *   stdout: JSON.stringify({ tag_name: 'v1.0.0' }),
 *   stderr: '',
 *   code: 0,
 * });
 *
 * // Or configure the next response
 * mockShell.mockNextResponse({
 *   stdout: JSON.stringify({ tag_name: 'v1.0.0' }),
 *   stderr: '',
 *   code: 0,
 * });
 * ```
 */
export function createMockShell(): IMockShell {
  const endpointResponses = new Map<string | RegExp, IMockShellResponse>();
  let nextResponse: IMockShellResponse | null = null;
  const executedCommands: string[] = [];

  function findResponse(command: string): IMockShellResponse {
    // Check for configured next response
    if (nextResponse) {
      const response = nextResponse;
      nextResponse = null;
      return response;
    }

    // Check for endpoint-specific responses
    for (const [pattern, response] of endpointResponses) {
      if (typeof pattern === 'string') {
        if (command.includes(pattern)) {
          return response;
        }
      } else if (pattern.test(command)) {
        return response;
      }
    }

    // Default: simulate not found
    return {
      stdout: '',
      stderr: 'gh: Not Found (HTTP 404)',
      code: 1,
    };
  }

  function createMockShellCommand(command: string): ShellCommand {
    executedCommands.push(command);

    const shellCommand: ShellCommand = {
      cwd: () => shellCommand,
      env: () => shellCommand,
      quiet: () => shellCommand,
      noThrow: () => shellCommand,
      text: async () => {
        const response = findResponse(command);
        return response.stdout.trim();
      },
      json: async <T>() => {
        const response = findResponse(command);
        return JSON.parse(response.stdout) as T;
      },
      lines: async () => {
        const response = findResponse(command);
        return response.stdout.split('\n');
      },
      bytes: async () => {
        const response = findResponse(command);
        return new TextEncoder().encode(response.stdout);
      },
      then: <TResult1, TResult2>(
        onfulfilled?: ((value: ShellResult) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): Promise<TResult1 | TResult2> => {
        const response = findResponse(command);
        const result: ShellResult = {
          code: response.code,
          stdout: response.stdout,
          stderr: response.stderr,
        };
        return Promise.resolve(result).then(onfulfilled, onrejected);
      },
    };

    return shellCommand;
  }

  const shellFn = mock((commandOrStrings: string | TemplateStringsArray, ...values: unknown[]): ShellCommand => {
    let command: string;
    if (typeof commandOrStrings === 'string') {
      command = commandOrStrings;
    } else {
      // Template literal: reconstruct the string
      command = commandOrStrings.reduce((acc, str, i) => {
        return acc + str + (values[i] !== undefined ? String(values[i]) : '');
      }, '');
    }
    return createMockShellCommand(command);
  }) as unknown as IMockShell;

  shellFn.mockNextResponse = (response: IMockShellResponse) => {
    nextResponse = response;
  };

  shellFn.mockResponseForEndpoint = (pattern: string | RegExp, response: IMockShellResponse) => {
    endpointResponses.set(pattern, response);
  };

  shellFn.clearMocks = () => {
    endpointResponses.clear();
    nextResponse = null;
    executedCommands.length = 0;
  };

  shellFn.getExecutedCommands = () => [...executedCommands];

  return shellFn;
}

/**
 * Creates a successful JSON response for gh api.
 */
export function createSuccessResponse<T>(data: T): IMockShellResponse {
  return {
    stdout: JSON.stringify(data),
    stderr: '',
    code: 0,
  };
}

/**
 * Creates an error response for gh api.
 */
export function createErrorResponse(message: string, code: number = 1): IMockShellResponse {
  return {
    stdout: '',
    stderr: message,
    code,
  };
}
