import type { $ } from 'bun';

/**
 * Creates a mock shell instance that matches the Bun $ interface.
 * This provides a comprehensive mock that can be used in tests that need shell execution.
 *
 * @returns A mock shell instance compatible with typeof $
 */
// biome-ignore lint/suspicious/noExplicitAny: Mock must return compatible type with Bun $
export function createMock$(): any {
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

  // Main shell function with proper typing for Bun
  const mockShell: typeof $ = ((_pieces: TemplateStringsArray, ..._args: unknown[]): unknown => {
    const result = Promise.resolve(mockResult);
    // Add Bun-specific methods
    // biome-ignore lint/suspicious/noExplicitAny: Mock needs to add methods to promise
    (result as any).quiet = () => result;
    // biome-ignore lint/suspicious/noExplicitAny: Mock needs to add methods to promise
    (result as any).nothrow = () => result;
    // biome-ignore lint/suspicious/noExplicitAny: Mock needs to add methods to promise
    (result as any).text = () => Promise.resolve('');
    // biome-ignore lint/suspicious/noExplicitAny: Mock needs to add methods to promise
    (result as any).json = () => Promise.resolve({});
    return result;
  }) as typeof $;

  return mockShell;
}
