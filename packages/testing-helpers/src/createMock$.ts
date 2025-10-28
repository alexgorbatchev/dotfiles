import type { $ } from 'bun';

export interface MockShellExtensions {
  commands: string[];
  lastCommand: string | null;
  reset(): void;
}

export type MockShell = typeof $ & MockShellExtensions;

/**
 * Creates a mock shell instance that matches the Bun $ interface.
 * This provides a comprehensive mock that can be used in tests that need shell execution.
 *
 * @returns A mock shell instance compatible with typeof $ and captures commands
 */
export function createMock$(): MockShell {
  const commands: string[] = [];
  let lastCommand: string | null = null;

  const mockBuffer = Buffer.from('');
  const mockResult = {
    stdout: mockBuffer,
    stderr: mockBuffer,
    exitCode: 0,
    text: () => Promise.resolve(''),
    json: () => Promise.resolve({}),
    blob: () => Promise.resolve(new Blob()),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  };

  // Create a chainable result that supports Bun's $ methods
  const createChainableResult = (): ReturnType<typeof $> => {
    const result = Promise.resolve(mockResult);

    // Add all Bun ShellPromise methods with proper chaining
    const chainable = Object.assign(result, {
      stdin: null,
      cwd: (_dir: string) => createChainableResult(),
      env: (_env: Record<string, string>) => createChainableResult(),
      quiet: () => createChainableResult(),
      nothrow: () => createChainableResult(),
      text: () => Promise.resolve(''),
      json: () => Promise.resolve({}),
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

    commands.push(command.trim());
    lastCommand = command.trim();

    return createChainableResult();
  };

  // Create the mock shell with additional properties
  const mockShell = Object.assign(mockShellFunction, {
    // Mock properties for testing
    commands,
    get lastCommand() {
      return lastCommand;
    },
    reset: () => {
      commands.length = 0;
      lastCommand = null;
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
