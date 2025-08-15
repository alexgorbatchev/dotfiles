import type { $ } from 'zx';

/**
 * Creates a mock shell instance that matches the zx $ interface.
 * This provides a comprehensive mock that can be used in tests that need shell execution.
 *
 * @returns A mock shell instance compatible with typeof $
 */
export function createMock$(): typeof $ {
  const mockShell = ((_command: TemplateStringsArray, ..._args: unknown[]) => {
    return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
  }) as unknown;

  // Add required Shell properties to make it compatible with typeof $
  const shell = mockShell as Record<string, unknown>;
  shell['sync'] = mockShell;
  shell['create'] = () => mockShell;
  shell['verbose'] = false;
  shell['quote'] = (str: string) => str;
  shell['spawn'] = () => ({});
  shell['sleep'] = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  return mockShell as typeof $;
}
