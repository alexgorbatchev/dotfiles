/**
 * Custom error class for errors originating from the GitHub API client.
 */
export class GitHubApiClientError extends Error {
  public readonly originalError?: unknown;
  public readonly statusCode?: number;

  /**
   * Creates an instance of GitHubApiClientError.
   * @param message - The error message.
   * @param statusCode - Optional HTTP status code associated with the error.
   * @param originalError - Optional original error that was caught.
   */
  constructor(message: string, statusCode?: number, originalError?: unknown) {
    super(message);
    this.name = 'GitHubApiClientError';
    this.statusCode = statusCode;
    this.originalError = originalError;

    // This line is needed to restore the prototype chain in ES5
    Object.setPrototypeOf(this, GitHubApiClientError.prototype);
  }
}
