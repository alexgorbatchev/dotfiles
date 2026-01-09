import { $ } from 'dax-sh';

/**
 * Options for configuring command execution.
 */
interface IExecuteCommandOptions {
  /** Working directory for command execution. Defaults to current directory. */
  cwd?: string;
  /** Environment variables to merge with process.env. */
  env?: Record<string, string>;
}

function truncateCommandOutput(output: string, maxChars: number): string {
  if (output.length <= maxChars) {
    return output;
  }

  const truncated: string = output.slice(0, maxChars);
  const result: string = `${truncated}\n... (truncated)`;
  return result;
}

/**
 * Executes a shell command using Bun's `$` operator.
 *
 * Runs the specified command with optional environment variables and working directory.
 * By default, logs the command being executed and any errors that occur.
 *
 * @param args - Command and arguments as an array of strings.
 * @param opts - Optional execution options.
 * @throws {Error} If the command exits with a non-zero code.
 */
export async function executeCommand(args: string[], opts: IExecuteCommandOptions = {}): Promise<void> {
  const { cwd = process.cwd(), env } = opts;
  const command = args.join(' ');

  const mergedEnv = env ? { ...process.env, ...env } : process.env;
  const result = await $`${args}`.cwd(cwd).env(mergedEnv).quiet().noThrow();

  if (result.code !== 0) {
    const stdout: string = result.stdout.toString().trim();
    const stderr: string = result.stderr.toString().trim();

    const maxChars: number = 12_000;
    const detailsParts: string[] = [];

    if (stderr.length > 0) {
      detailsParts.push(`stderr:\n${truncateCommandOutput(stderr, maxChars)}`);
    }

    if (stdout.length > 0) {
      detailsParts.push(`stdout:\n${truncateCommandOutput(stdout, maxChars)}`);
    }

    const details: string = detailsParts.length > 0 ? `\n\n${detailsParts.join('\n\n')}` : '';
    throw new Error(`Command failed (exit code ${result.code}): ${command}${details}`);
  }
}
