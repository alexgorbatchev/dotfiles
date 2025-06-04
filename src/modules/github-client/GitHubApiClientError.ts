/**
 * @file Defines the GitHubApiClientError class for handling errors from the GitHub API client.
 *
 * ## Development Plan
 *
 * - [x] Define GitHubApiClientError class extending Error.
 * - [x] Add constructor to accept message and optional originalError/statusCode.
 * - [ ] Write tests for the module. (N/A - Simple error class, tested via GitHubApiClient.test.ts)
 * - [ ] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Ensure 100% test coverage for executable code. (N/A)
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

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
