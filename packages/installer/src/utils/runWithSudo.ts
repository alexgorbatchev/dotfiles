import type { IInstallContext } from "@dotfiles/core";

const DEFAULT_SUDO_PROMPT = "Please enter your password to continue:";

interface IRunWithSudoOptions {
  command?: string[];
  cwd?: string;
  failureLabel?: string;
}

export async function runWithSudo(
  toolName: string,
  context: IInstallContext,
  options: IRunWithSudoOptions = {},
): Promise<void> {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    throw new Error(`Tool "${toolName}" requires an interactive terminal for sudo installation`);
  }

  process.stderr.write(`Tool "${toolName}" requires sudo privileges because it is configured with \`sudo()\`.\n`);

  const sudoPrompt = context.projectConfig.system?.sudoPrompt ?? DEFAULT_SUDO_PROMPT;
  const sudoCommand =
    options.command && options.command.length > 0
      ? ["sudo", "-p", sudoPrompt, "--", ...options.command]
      : ["sudo", "-p", sudoPrompt, "-v"];

  const proc = Bun.spawn({
    cmd: sudoCommand,
    cwd: options.cwd ?? context.stagingDir,
    env: context.installEnv ?? process.env,
    stdio: ["inherit", "inherit", "inherit"],
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`${options.failureLabel ?? "sudo command"} exited with code ${exitCode}`);
  }
}
