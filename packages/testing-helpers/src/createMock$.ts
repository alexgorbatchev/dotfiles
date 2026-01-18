import { extendedShellBrand, type Shell, type ShellCommand } from '@dotfiles/core';

export interface IMockShellExtensions {
  reset(): void;
  mockResponse(command: string, response: IMockShellResponse): void;
}

export interface IMockShellResponse {
  stdout: string | Buffer;
  stderr: string | Buffer;
  code?: number;
  exitCode?: number; // Compat
  shouldThrow?: boolean;
}

export type MockShell =
  & Shell
  & IMockShellExtensions
  & {
    (command: string): ShellCommand;
    readonly [extendedShellBrand]: true;
  };

function reconstructCommand(pieces: TemplateStringsArray | string, args: unknown[]): string {
  if (typeof pieces === 'string') {
    return pieces;
  }
  let command = '';
  for (let i = 0; i < pieces.length; i++) {
    command += pieces[i];
    if (i < args.length) {
      const arg = args[i];
      // Handle arrays properly - join with spaces instead of commas
      if (Array.isArray(arg)) {
        command += arg.join(' ');
      } else {
        command += String(arg);
      }
    }
  }
  return command;
}

/**
 * Creates a mock shell instance that matches the Bun $ interface.
 * This provides a comprehensive mock that can be used in tests that need shell execution.
 *
 * @returns A mock shell instance compatible with typeof $ and captures commands
 */
export function createMock$(): MockShell {
  const commands: string[] = [];
  const responses: Map<string, IMockShellResponse> = new Map();
  let lastCommand: string | null = null;

  // Create a chainable result that supports Shell's ShellCommand methods
  const createChainableResult = (command: string, shouldNothrow = false): ShellCommand => {
    // Check if we have a mocked response for this command
    const mockedResponse: IMockShellResponse | undefined = responses.get(command);

    const stdoutVal = mockedResponse?.stdout !== undefined ? mockedResponse.stdout.toString() : '';
    const stderrVal = mockedResponse?.stderr !== undefined ? mockedResponse.stderr.toString() : '';
    const exitCodeVal = mockedResponse?.code ?? mockedResponse?.exitCode ?? 0;

    const resultData = {
      stdout: stdoutVal,
      stderr: stderrVal,
      code: exitCodeVal,
    };

    const mockResult = {
      ...resultData,
      get stdoutBytes() {
        return new TextEncoder().encode(stdoutVal);
      },
      get stderrBytes() {
        return new TextEncoder().encode(stderrVal);
      },
    };

    // If shouldThrow is true and nothrow wasn't called, create a rejected promise
    const shouldThrowError: boolean = Boolean(mockedResponse?.shouldThrow && !shouldNothrow);
    const resultPromise: Promise<typeof mockResult> = shouldThrowError
      ? Promise.reject(new Error(stderrVal))
      : Promise.resolve(mockResult);

    // Add all ShellCommand methods with proper chaining
    const chainable = Object.assign(resultPromise, {
      cwd: (_dir: string) => createChainableResult(command, shouldNothrow),
      env: (_env: Record<string, string | undefined>) => createChainableResult(command, shouldNothrow),
      quiet: () => createChainableResult(command, shouldNothrow),
      noThrow: () => createChainableResult(command, true),
      text: () => Promise.resolve(stdoutVal),
      json: () => Promise.resolve(JSON.parse(stdoutVal || '{}')),
      lines: () => Promise.resolve(stdoutVal.split('\n')),
      bytes: () => Promise.resolve(new TextEncoder().encode(stdoutVal)),
    });

    return chainable as unknown as ShellCommand;
  };

  // Main shell function
  const mockShellFunction = (pieces: TemplateStringsArray | string, ...args: unknown[]) => {
    // Reconstruct the command string from template literal
    const command = reconstructCommand(pieces, args);
    const trimmedCommand: string = command.trim();
    commands.push(trimmedCommand);
    lastCommand = trimmedCommand;

    return createChainableResult(trimmedCommand);
  };

  // Create the mock shell with additional properties
  const mockShell = Object.assign(mockShellFunction, {
    // Mock properties for testing
    commands,
    responses,
    get lastCommand() {
      return lastCommand;
    },
    reset: () => {
      commands.length = 0;
      responses.clear();
      lastCommand = null;
    },
    mockResponse: (command: string, response: IMockShellResponse) => {
      responses.set(command, response);
    },
    [extendedShellBrand]: true as const,
  });

  // Use type assertion to make it compatible
  return mockShell as unknown as MockShell;
}
