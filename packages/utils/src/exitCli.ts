export const ExitCode = {
  SUCCESS: 0,
  ERROR: 1,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

export function exitCli(exitCode: number): never {
  if (process.env.NODE_ENV !== "test") {
    process.exit(exitCode);
  }
  // In test environment, throw to signify termination for testing purposes
  // and to satisfy the 'never' return type.
  throw new Error(`MOCK_EXIT_CLI_CALLED_WITH_${exitCode}`);
}
