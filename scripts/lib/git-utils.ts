import { $ } from 'bun';

export async function executeCommand(
  args: string[],
  cwd: string = process.cwd(),
  env?: Record<string, string>
): Promise<void> {
  const command = args.join(' ');
  console.log(`🔧 Running: ${command}`);
  const result = await $`${args}`
    .cwd(cwd)
    .env(env ?? {})
    .quiet();

  if (result.exitCode !== 0) {
    console.error(`❌ Command failed: ${command}`);
    console.error(`Exit code: ${result.exitCode}`);
    console.error(`Error output: ${result.stderr.toString()}`);
    throw new Error(`Command failed with exit code ${result.exitCode}`);
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
