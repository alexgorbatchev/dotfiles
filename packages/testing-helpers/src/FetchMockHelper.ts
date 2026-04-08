import { spyOn } from "bun:test";

/**
 * Options for mocking a fetch response.
 */
type MockResponseOmittedKeys = "body" | "error";

interface IMockResponseOptions {
  /** The body of the response. Can be string, Blob, ArrayBuffer, FormData, URLSearchParams, ReadableStream, or null. */
  body?: string | Blob | ArrayBuffer | FormData | URLSearchParams | ReadableStream | null;
  /** The HTTP status code of the response. Defaults to 200. */
  status?: number;
  /** The status text of the response. Defaults to 'OK'. */
  statusText?: string;
  /** The headers of the response. Can be Headers, [string, string][], Record<string, string>, or undefined. */
  headers?: Headers | [string, string][] | Record<string, string>;
  /** An error to simulate a network error, causing fetch to reject. */
  error?: Error;
}

/**
 * A helper class for spying on and mocking `globalThis.fetch` in tests
 * using `bun:test`.
 */
export class FetchMockHelper {
  private spyFetch: ReturnType<typeof spyOn<typeof globalThis, "fetch">> | null = null;

  /**
   * Sets up the spy on `globalThis.fetch`.
   * This method should typically be called in a `beforeAll` or `beforeEach` block in tests.
   * It replaces the global fetch with a spy that can be controlled for testing purposes.
   */
  setup(): void {
    this.spyFetch = spyOn(globalThis, "fetch");
  }

  /**
   * Resets the mock's history and any specific implementations (`mockImplementationOnce`, `mockImplementation`).
   * This is useful in `beforeEach` or `afterEach` to ensure tests do not interfere with each other.
   * If `setup()` has not been called or `restore()` has been called, this method is a no-op.
   */
  reset(): void {
    if (!this.spyFetch) {
      // No-op if not setup, or already restored.
      // Per original task: "Consider throwing an error or ensuring setup is called."
      // Decided to keep no-op for now to avoid breaking changes if tests relied on this.
      // If strict error checking is desired, this could be:
      // throw new Error('FetchMockHelper not setup. Call setup() before resetting.');
      return;
    }
    this.spyFetch.mockReset();
  }

  /**
   * Restores the original `globalThis.fetch` implementation and removes the spy.
   * This should typically be called in an `afterAll` or `afterEach` block to clean up.
   * After calling `restore()`, the spy is no longer active, and `this.spyFetch` is set to `null`.
   */
  restore(): void {
    if (this.spyFetch) {
      this.spyFetch.mockRestore();
      this.spyFetch = null;
    }
  }

  /**
   * Mocks the next fetch call with the provided response options.
   * This mock only applies to the very next call to `fetch`.
   * @param options - Options for the mock response. Defaults to a 200 OK response with an empty body.
   * @throws {Error} If `setup()` has not been called before this method.
   */
  mockResponseOnce(options: IMockResponseOptions = {}): void {
    if (!this.spyFetch) {
      throw new Error("FetchMockHelper not setup. Call setup() before mocking responses.");
    }
    const { body = "", status = 200, statusText = "OK", headers = {}, error } = options;

    if (error) {
      this.spyFetch.mockImplementationOnce((() => Promise.reject(error)) as unknown as typeof fetch);
    } else {
      this.spyFetch.mockImplementationOnce((() =>
        Promise.resolve(new Response(body, { status, statusText, headers }))) as unknown as typeof fetch);
    }
  }

  /**
   * Mocks the next fetch call with a JSON response.
   * Sets the 'Content-Type' header to 'application/json'.
   * @param data - The JSON data to return in the response body.
   * @param options - Options for the mock response (excluding `body` and `error` as they are handled by this method).
   * @throws {Error} If `setup()` has not been called before this method.
   */
  mockJsonResponseOnce(data: unknown, options: Omit<IMockResponseOptions, MockResponseOmittedKeys> = {}): void {
    const responseHeaders = new Headers(options.headers);
    responseHeaders.set("Content-Type", "application/json");
    this.mockResponseOnce({
      body: JSON.stringify(data),
      ...options,
      headers: responseHeaders,
    });
  }

  /**
   * Mocks the next fetch call with a text response.
   * @param text - The text string to return in the response body.
   * @param options - Options for the mock response (excluding `body` and `error`).
   * @throws {Error} If `setup()` has not been called before this method.
   */
  mockTextResponseOnce(text: string, options: Omit<IMockResponseOptions, MockResponseOmittedKeys> = {}): void {
    this.mockResponseOnce({
      body: text,
      ...options,
    });
  }

  /**
   * Mocks the next fetch call to simulate a network error or other fetch-related error.
   * The promise returned by `fetch` will be rejected with the provided error.
   * @param error - The error to throw. Defaults to a generic `Error('Simulated network error')`.
   * @throws {Error} If `setup()` has not been called before this method.
   */
  mockErrorOnce(error: Error = new Error("Simulated network error")): void {
    this.mockResponseOnce({ error });
  }

  /**
   * Mocks all subsequent fetch calls with the provided response options until `reset()` or another
   * `mockImplementation` or `mockImplementationOnce` is called.
   * @param options - Options for the mock response. Defaults to a 200 OK response with an empty body.
   * @throws {Error} If `setup()` has not been called before this method.
   */
  mockImplementation(options: IMockResponseOptions = {}): void {
    if (!this.spyFetch) {
      throw new Error("FetchMockHelper not setup. Call setup() before mocking responses.");
    }
    const { body = "", status = 200, statusText = "OK", headers = {}, error } = options;

    if (error) {
      this.spyFetch.mockImplementation((() => Promise.reject(error)) as unknown as typeof fetch);
    } else {
      this.spyFetch.mockImplementation((() =>
        Promise.resolve(new Response(body, { status, statusText, headers }))) as unknown as typeof fetch);
    }
  }

  /**
   * Gets the underlying `SpyInstance` for `globalThis.fetch`.
   * This allows for advanced assertions (e.g., `toHaveBeenCalledWith`) or direct manipulation if needed.
   * @returns The `SpyInstance` for `fetch`.
   * @throws {Error} If `setup()` has not been called or `restore()` has been called, as the spy would not be active.
   */
  getSpy(): ReturnType<typeof spyOn<typeof globalThis, "fetch">> {
    if (!this.spyFetch) {
      throw new Error(
        "FetchMockHelper not setup. Call setup() first to initialize the spy, or it may have been restored.",
      );
    }
    return this.spyFetch;
  }
}
