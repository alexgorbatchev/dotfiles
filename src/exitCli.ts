
export function exitCli(exitCode: number): never {
  if (process.env.NODE_ENV !== 'test') {
    process.exit(exitCode);
  }
  // In test environment, throw to signify termination for testing purposes
  // and to satisfy the 'never' return type.
  throw new Error(`TEST_EXIT_CLI_CALLED_WITH_${exitCode}`);
}
