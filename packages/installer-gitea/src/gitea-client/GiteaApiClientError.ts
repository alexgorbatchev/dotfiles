/**
 * Custom error class for errors originating from the Gitea API client.
 */
export class GiteaApiClientError extends Error {
  public readonly originalError?: unknown;
  public readonly statusCode?: number;

  constructor(message: string, statusCode?: number, originalError?: unknown) {
    super(message);
    this.name = 'GiteaApiClientError';
    this.statusCode = statusCode;
    this.originalError = originalError;
    Object.setPrototypeOf(this, GiteaApiClientError.prototype);
  }
}
