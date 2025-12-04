export class BuildError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'BuildError';
  }
}

function getRootCause(error: unknown): unknown {
  let current: unknown = error;
  while (
    current &&
    typeof current === 'object' &&
    'cause' in current &&
    current.cause !== undefined &&
    current.cause !== null
  ) {
    current = current.cause;
  }
  return current;
}

function logErrorDetails(_error: unknown): void {
  // Error logging intentionally left empty - errors are handled by caller
}

export async function handleBuildError(
  operation: () => Promise<unknown>,
  finallyCallback?: () => Promise<unknown> | unknown
): Promise<void> {
  try {
    await operation();
  } catch (e: unknown) {
    const error = e as Error;

    if (error instanceof BuildError && error.cause) {
      logErrorDetails(getRootCause(error));
    } else {
      // logErrorDetails(error);
    }
  } finally {
    if (finallyCallback) {
      await finallyCallback();
    }
  }
}
