import type { $ } from 'bun';

export interface IMockShellExtensions {
  reset(): void;
  mockResponse(command: string, response: IMockShellResponse): void;
}

export interface IMockShellResponse {
  stdout: Buffer;
  stderr: Buffer;
  exitCode: number;
  shouldThrow?: boolean;
}

export type MockShell = typeof $ & IMockShellExtensions;

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

  const mockBuffer = Buffer.from('');

  // Create a chainable result that supports Bun's $ methods
  const createChainableResult = (command: string, shouldNothrow = false): ReturnType<typeof $> => {
    // Check if we have a mocked response for this command
    const mockedResponse: IMockShellResponse | undefined = responses.get(command);

    const resultData = mockedResponse || {
      stdout: mockBuffer,
      stderr: mockBuffer,
      exitCode: 0,
    };

    const mockResult = {
      ...resultData,
      text: () => Promise.resolve(resultData.stdout.toString()),
      json: () => Promise.resolve(JSON.parse(resultData.stdout.toString() || '{}')),
      blob: () => Promise.resolve(new Blob()),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    };

    // If shouldThrow is true and nothrow wasn't called, create a rejected promise
    const shouldThrowError: boolean = Boolean(mockedResponse?.shouldThrow && !shouldNothrow);
    const resultPromise: Promise<typeof mockResult> = shouldThrowError
      ? Promise.reject(new Error(resultData.stderr.toString()))
      : Promise.resolve(mockResult);

    // Add all Bun ShellPromise methods with proper chaining
    const chainable = Object.assign(resultPromise, {
      stdin: null,
      cwd: (_dir: string) => createChainableResult(command, shouldNothrow),
      env: (_env: Record<string, string>) => createChainableResult(command, shouldNothrow),
      quiet: () => createChainableResult(command, shouldNothrow),
      nothrow: () => createChainableResult(command, true),
      text: () => Promise.resolve(resultData.stdout.toString()),
      json: () => Promise.resolve(JSON.parse(resultData.stdout.toString() || '{}')),
      blob: () => Promise.resolve(new Blob()),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      lines: () => Promise.resolve([]),
      bytes: () => Promise.resolve(new Uint8Array()),
      throws: true,
    });

    return chainable as unknown as ReturnType<typeof $>;
  };

  // Main shell function with proper typing for Bun
  const mockShellFunction = (pieces: TemplateStringsArray, ...args: unknown[]) => {
    // Reconstruct the command string from template literal
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

    // Stub implementations of Bun $ static properties
    braces: () => '',
    escape: (str: string) => str,
    env: {},
    cwd: () => process.cwd(),
  });

  // Use type assertion to make it compatible
  return mockShell as unknown as MockShell;
}
