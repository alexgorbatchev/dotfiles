const env = process.env as any;

if (
  env.BUN_CORRECT_TEST_COMMAND !== '1' &&
  !process.argv[1]?.endsWith('bun-test-runner.ts')
) {
  console.error('Please use `bun run test` instead, takes the same arguments as `bun test`.');
  process.exit(1);
}

env.NODE_ENV = 'test';
