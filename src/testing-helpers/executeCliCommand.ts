import * as path from 'path';

/**
 * Options for executing a CLI command
 */
export interface CliCommandOptions {
  /** CLI command and arguments */
  command: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Optional current working directory */
  cwd?: string;
  /** Optional home directory */
  homeDir?: string;
  /** Optional custom command to use instead of the CLI entry point */
  customCmd?: string[];
}

/**
 * Result of executing a CLI command
 */
export interface CliCommandResult {
  /** Exit code of the command */
  exitCode: number | null;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
}

/**
 * Executes a CLI command using Bun.spawnSync
 *
 * @param options - Options for executing the command
 * @returns Result of the command execution
 */
export function executeCliCommand(options: CliCommandOptions): CliCommandResult {
  const { command, env = {}, cwd, homeDir, customCmd } = options;

  // Prepare environment variables
  const execEnv: Record<string, string> = {
    ...env,
    PATH: process.env['PATH'] || '',
  };

  // Add HOME if provided
  if (homeDir) {
    execEnv['HOME'] = homeDir;
  }

  let cmd: string[];
  let execCwd: string;

  if (customCmd) {
    // Use custom command if provided
    cmd = [...customCmd, ...command];
    execCwd = cwd || process.cwd();
  } else {
    // Find CLI entry point
    const generatorProjectRootPath = path.resolve(__dirname, '../../');
    const cliEntryPoint = path.join(generatorProjectRootPath, 'src', 'cli.ts');
    cmd = ['bun', cliEntryPoint, ...command];
    execCwd = cwd || generatorProjectRootPath;
  }

  // Execute command
  const proc = Bun.spawnSync({
    cmd,
    cwd: execCwd,
    env: execEnv,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}
