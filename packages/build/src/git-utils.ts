import { $ } from 'bun';

interface ExecuteCommandOptions {
  cwd?: string;
  env?: Record<string, string>;
  expectToFail?: boolean;
}

export async function executeCommand(args: string[], opts: ExecuteCommandOptions = {}): Promise<void> {
  const { cwd = process.cwd(), env, expectToFail = false } = opts;
  const command = args.join(' ');

  if (!expectToFail) {
    console.log(`🔧 Running: ${command}`);
  }

  const mergedEnv = env ? { ...process.env, ...env } : process.env;
  const result = await $`${args}`.cwd(cwd).env(mergedEnv).quiet().nothrow();

  if (result.exitCode !== 0) {
    if (!expectToFail) {
      const stdout = result.stdout.toString();
      const stderr = result.stderr.toString();

      console.error(`❌ Command failed: ${command}`);
      console.error(`Exit code: ${result.exitCode}`);
      if (stdout) console.error(stdout);
      if (stderr) console.error(stderr);
    }
    throw new Error(`Command failed: ${command}`);
  }
}

export async function validateGitRepository(cwd: string = process.cwd()): Promise<void> {
  try {
    const args = ['rev-parse', '--git-dir'];
    const result = await $`git ${args}`.cwd(cwd).quiet();
    if (result.exitCode !== 0) {
      throw new Error('Not a git repository');
    }
    console.log('✓ Confirmed we are in a git repository');
  } catch {
    throw new Error('Not in a git repository. Please run this script from the project root.');
  }
}
