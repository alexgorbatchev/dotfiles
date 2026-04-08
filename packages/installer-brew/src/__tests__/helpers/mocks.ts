import type { Shell } from "@dotfiles/core";

interface IMockShellPromise extends Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  code: number;
  toString: () => string;
}> {
  quiet: () => IMockShellPromise;
  nothrow: () => IMockShellPromise;
  noThrow: () => IMockShellPromise;
  env: () => IMockShellPromise;
}

export function createMockShell(): Shell {
  return ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const cmd = strings.reduce((acc, str, i) => acc + str + (values[i] || ""), "");
    let stdout = "";

    if (cmd.includes("brew --prefix")) {
      stdout = "/opt/homebrew/opt/test-tool";
    } else if (cmd.includes("brew info --json")) {
      stdout = JSON.stringify([{ name: "test-tool", versions: { stable: "1.2.3" } }]);
    } else if (cmd.includes("--version")) {
      stdout = "tool version 1.2.3";
    }

    const result = {
      stdout,
      stderr: "",
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
