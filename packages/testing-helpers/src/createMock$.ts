import type { $ } from 'zx';

/**
 * Creates a mock shell instance that matches the zx $ interface.
 * This provides a comprehensive mock that can be used in tests that need shell execution.
 *
 * @returns A mock shell instance compatible with typeof $
 */
// biome-ignore lint/suspicious/noExplicitAny: Mock must return compatible type with zx $
export function createMock$(): any {
  const mockResult = { stdout: '', stderr: '', exitCode: 0 };

  // Create sync object that matches Shell.sync interface
  const syncObj: {
    (pieces: TemplateStringsArray, ...args: unknown[]): typeof mockResult;
    (opts: Record<string, unknown>): typeof syncObj;
  } = ((_pieces: TemplateStringsArray | Record<string, unknown>, ..._args: unknown[]): unknown => {
    // If first arg is an object, return a sync shell
    if (!Array.isArray(_pieces)) {
      return syncObj;
    }
    // Otherwise return sync result
    return mockResult;
  }) as typeof syncObj;

  // Main shell function with proper typing
  const mockShell: typeof $ = ((
    _pieces: TemplateStringsArray | Record<string, unknown>,
    ..._args: unknown[]
  ): unknown => {
    // If first arg is an object, it's options - return a shell function
    if (!Array.isArray(_pieces)) {
      return mockShell;
    }
    // Otherwise it's a template string - return a promise
    const result = Promise.resolve(mockResult);
    // biome-ignore lint/suspicious/noExplicitAny: Mock needs to add nothrow method to promise
    (result as any).nothrow = () => Promise.resolve(mockResult);
    return result;
  }) as typeof $;

  // Add required Shell properties
  // biome-ignore lint/suspicious/noExplicitAny: Mock setup requires property assignment
  (mockShell as any).sync = syncObj;
  // biome-ignore lint/suspicious/noExplicitAny: Mock setup requires property assignment
  (mockShell as any).verbose = false;
  // biome-ignore lint/suspicious/noExplicitAny: Mock setup requires property assignment
  (mockShell as any).quote = (str: string) => str;
  // biome-ignore lint/suspicious/noExplicitAny: Mock setup requires property assignment
  (mockShell as any).spawn = () => ({});
  // biome-ignore lint/suspicious/noExplicitAny: Mock setup requires property assignment
  (mockShell as any).sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  return mockShell;
}
