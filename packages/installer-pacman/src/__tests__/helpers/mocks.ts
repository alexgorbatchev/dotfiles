import type { IShell } from "@dotfiles/core";

interface IMockShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  code: number;
  toString: () => string;
}

interface IMockShellPromise extends Promise<IMockShellResult> {
  quiet: () => IMockShellPromise;
  nothrow: () => IMockShellPromise;
  noThrow: () => IMockShellPromise;
  env: () => IMockShellPromise;
}

type MockShellHandler = (cmd: string) => IMockShellResult;

function createResult(stdout: string): IMockShellResult {
  return {
    stdout,
    stderr: "",
    exitCode: 0,
    code: 0,
    toString: () => stdout,
  };
}

export function createMockShell(handler?: MockShellHandler): IShell {
  return ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const cmd = strings.reduce((acc, str, index) => acc + str + (values[index] ?? ""), "");
    const result = handler?.(cmd) ?? createDefaultResult(cmd);
    const promise = Promise.resolve(result) as IMockShellPromise;
    promise.quiet = () => promise;
    promise.nothrow = () => promise;
    promise.noThrow = () => promise;
    promise.env = () => promise;
    return promise;
  }) as unknown as IShell;
}

function createDefaultResult(cmd: string): IMockShellResult {
  if (cmd.includes("pacman -Q")) {
    return createResult("ripgrep 13.0.0-1");
  }

  if (cmd.includes("command -v")) {
    return createResult("/usr/bin/rg\n");
  }

  return createResult("");
}
