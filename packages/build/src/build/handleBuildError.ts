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

function logErrorDetails(error: unknown): void {
  if (error !== null && typeof error === 'object') {
    if ('stderr' in error) {
      console.error(String(error.stderr));
    } else {
      console.error(error);
    }

    // if ('stack' in rootCause) console.error(rootCause.stack);
  }
}

export async function handleBuildError(
  operation: () => Promise<unknown>,
  finallyCallback?: () => Promise<unknown> | unknown
): Promise<void> {
  try {
    await operation();
  } catch (e: unknown) {
    const error = e as Error;
    console.error(`❌ ${error.message}`);

    if (error instanceof BuildError && error.cause) {
      console.error('❌ Caused by:');
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
