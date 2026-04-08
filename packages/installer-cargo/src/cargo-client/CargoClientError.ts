/**
 * Custom error class for Cargo API client errors.
 * Provides structured error information for better error handling.
 */
export class CargoClientError extends Error {
  public readonly statusCode?: number;
  public override readonly cause?: Error;

  constructor(message: string, statusCode?: number, cause?: Error) {
    super(message);
    this.name = "CargoClientError";
    this.statusCode = statusCode;
    this.cause = cause;

    // Maintain proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CargoClientError);
    }
  }
}
