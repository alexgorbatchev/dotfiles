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

type CommandHandler = (cmd: string) => IMockShellResult;

function createDefaultHandler(): CommandHandler {
  return (cmd: string): IMockShellResult => {
    let stdout = "";

    if (cmd.includes("bun pm bin -g")) {
      stdout = "/mock/global/bin";
    } else if (cmd.includes("bun pm ls -g")) {
      stdout = "/home/test/.bun/install/global node_modules (1)\n└── prettier@3.1.0";
    } else if (cmd.includes("npm prefix -g")) {
      stdout = "/mock/global";
    } else if (cmd.includes("npm ls -g --depth=0 --json")) {
      stdout = '{"name":"lib","dependencies":{"prettier":{"version":"3.1.0","overridden":false}}}';
    } else if (cmd.includes("bun info") && cmd.includes("version --json")) {
      stdout = '"3.1.0"';
    } else if (cmd.includes("npm view")) {
      stdout = "3.1.0";
    } else if (cmd.includes("bun install -g") || cmd.includes("npm install -g")) {
      stdout = "";
    } else if (cmd.includes("--version")) {
      stdout = "3.1.0";
    }

    return { stdout, stderr: "", exitCode: 0, code: 0, toString: () => stdout };
  };
}

export function createMockShell(handler?: CommandHandler): IShell {
  const resolveCommand = handler ?? createDefaultHandler();

  return ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const cmd = strings.reduce((acc, str, i) => acc + str + (values[i] || ""), "");
    const result = resolveCommand(cmd);

    const promise = Promise.resolve(result) as IMockShellPromise;
    promise.quiet = () => promise;
    promise.nothrow = () => promise;
    promise.noThrow = () => promise;
    promise.env = () => promise;

    return promise;
  }) as unknown as IShell;
}

export function createFailingMockShell(): IShell {
  return ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const cmd = strings.reduce((acc, str, i) => acc + str + (values[i] || ""), "");

    if (cmd.includes("npm install -g") || cmd.includes("bun install -g")) {
      const error = new Error("install failed");
      const rejectedPromise = Promise.reject(error) as IMockShellPromise;
      rejectedPromise.quiet = () => rejectedPromise;
      rejectedPromise.nothrow = () => rejectedPromise;
      rejectedPromise.noThrow = () => rejectedPromise;
      rejectedPromise.env = () => rejectedPromise;
      return rejectedPromise;
    }

    const result: IMockShellResult = { stdout: "", stderr: "", exitCode: 0, code: 0, toString: () => "" };
    const promise = Promise.resolve(result) as IMockShellPromise;
    promise.quiet = () => promise;
    promise.nothrow = () => promise;
    promise.noThrow = () => promise;
    promise.env = () => promise;
    return promise;
  }) as unknown as IShell;
}
