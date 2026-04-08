export class BuildError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "BuildError";
  }
}

function isError(value: unknown): value is Error {
  return value instanceof Error;
}

function getRootCause(error: unknown): unknown {
  let current: unknown = error;
  while (
    current &&
    typeof current === "object" &&
    "cause" in current &&
    current.cause !== undefined &&
    current.cause !== null
  ) {
    current = current.cause;
  }
  return current;
}

type BuildOperation = () => Promise<unknown>;
type BuildFinallyCallback = () => Promise<unknown> | unknown;

function logErrorDetails(error: unknown): void {
  if (isError(error)) {
    if (error.stack) {
      console.error(error.stack);
      return;
    }
    console.error(error.message);
    return;
  }

  console.error(String(error));
}

export async function handleBuildError(
  operation: BuildOperation,
  finallyCallback?: BuildFinallyCallback,
): Promise<void> {
  try {
    await operation();
  } catch (error: unknown) {
    if (error instanceof BuildError) {
      console.error("Build failed");
      console.error(`Reason: ${error.message}`);
      const rootCause: unknown = getRootCause(error);
      if (rootCause !== error) {
        logErrorDetails(rootCause);
      }
      process.exitCode = 1;
      return;
    } else {
      const rootCause: unknown = getRootCause(error);
      console.error("Build failed unexpectedly");
      logErrorDetails(rootCause);
      process.exitCode = 1;
    }
  } finally {
    if (finallyCallback) {
      await finallyCallback();
    }
  }
}
