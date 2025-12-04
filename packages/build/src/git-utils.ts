import { $ } from 'bun';

/**
 * Options for configuring command execution.
 */
interface IExecuteCommandOptions {
  /** Working directory for command execution. Defaults to current directory. */
  cwd?: string;
  /** Environment variables to merge with process.env. */
  env?: Record<string, string>;
  /** If true, suppresses error logging when the command fails. */
  expectToFail?: boolean;
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
  const result = await $`${args}`.cwd(cwd).env(mergedEnv).quiet().nothrow();

  if (result.exitCode !== 0) {
    throw new Error(`Command failed: ${command}`);
  }
}

/**
 * Validates that the current directory is within a git repository.
 *
 * Runs `git rev-parse --git-dir` to verify that git is available and the
 * current directory is part of a git repository.
 *
 * @param cwd - Working directory to check. Defaults to current directory.
 * @throws {Error} If not in a git repository or git is not available.
 */
export async function validateGitRepository(cwd: string = process.cwd()): Promise<void> {
  try {
    const args = ['rev-parse', '--git-dir'];
    const result = await $`git ${args}`.cwd(cwd).quiet();
    if (result.exitCode !== 0) {
      throw new Error('Not a git repository');
    }
  } catch {
    throw new Error('Not in a git repository. Please run this script from the project root.');
  }
}
