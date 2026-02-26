import type { Shell } from '@dotfiles/core';

interface IMockShellPromise extends
  Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    code: number;
    toString: () => string;
  }>
{
  quiet: () => IMockShellPromise;
  nothrow: () => IMockShellPromise;
  noThrow: () => IMockShellPromise;
  env: () => IMockShellPromise;
}

export function createMockShell(): Shell {
  return ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const cmd = strings.reduce((acc, str, i) => acc + str + (values[i] || ''), '');
    let stdout = '';

    if (cmd.includes('npm ls')) {
      stdout = JSON.stringify({
        dependencies: {
          prettier: { version: '3.1.0' },
        },
      });
    } else if (cmd.includes('npm view')) {
      stdout = '3.1.0';
    } else if (cmd.includes('npm install')) {
      stdout = '';
    } else if (cmd.includes('--version')) {
      stdout = '3.1.0';
    }

    const result = {
      stdout,
      stderr: '',
      exitCode: 0,
      code: 0,
      toString: () => stdout,
    };

    const promise = Promise.resolve(result) as IMockShellPromise;
    promise.quiet = () => promise;
    promise.nothrow = () => promise;
    promise.noThrow = () => promise;
    promise.env = () => promise;

    return promise;
  }) as unknown as Shell;
}
