import type {
  IShell,
  IShellCommand,
  IShellResult,
  ShellCommandOnFulfilled,
  ShellCommandOnRejected,
} from "@dotfiles/core";

export interface IMockShell extends IShell {
  executedCommands: string[];
}

type MockShellInput = TemplateStringsArray | string;

export function createMockShell(): IMockShell {
  const executedCommands: string[] = [];

  const shellFn = ((strings: MockShellInput, ...values: unknown[]): IShellCommand => {
    const cmd =
      typeof strings === "string"
        ? strings
        : strings.reduce((acc, str, i) => {
            const val = values[i];
            const valStr = Array.isArray(val) ? val.join(" ") : val !== undefined ? String(val) : "";
            return acc + str + valStr;
          }, "");

    executedCommands.push(cmd);

    let stdout = "";
    if (cmd.includes("brew --prefix")) {
      stdout = "/opt/homebrew/opt/test-tool";
    } else if (cmd.includes("brew info --json")) {
      stdout = JSON.stringify([{ name: "test-tool", versions: { stable: "1.2.3" } }]);
    } else if (cmd.includes("--version")) {
      stdout = "tool version 1.2.3";
    }

    const result: IShellResult = {
      stdout,
      stderr: "",
      code: 0,
    };

    const cmdObj: IShellCommand = {
      cwd: () => cmdObj,
      env: () => cmdObj,
      quiet: () => cmdObj,
      noThrow: () => cmdObj,
      nothrow: () => cmdObj,
      text: async () => stdout.trim(),
      json: async <T>() => JSON.parse(stdout) as T,
      lines: async () => stdout.trim().split("\n"),
      bytes: async () => new TextEncoder().encode(stdout),
      then: <TResult1 = IShellResult, TResult2 = never>(
        onfulfilled?: ShellCommandOnFulfilled<TResult1>,
        onrejected?: ShellCommandOnRejected<TResult2>,
      ) => Promise.resolve(result).then(onfulfilled, onrejected),
    } as unknown as IShellCommand;

    return cmdObj;
  }) as unknown as IMockShell;

  shellFn.executedCommands = executedCommands;
  return shellFn;
}
