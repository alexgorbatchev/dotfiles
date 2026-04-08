/**
 * Configuration for the proxy fetch function.
 */
export interface IProxyFetchConfig {
  /** Whether the proxy is enabled */
  enabled: boolean;
  /** The port the proxy server is listening on */
  port: number;
}

export type ProxyFetchConfig = IProxyFetchConfig;

type ProxyFetchInput = RequestInfo | URL;

/**
 * Fetch function that routes requests through an HTTP proxy when enabled.
 *
 * When proxy is enabled, URLs are rewritten:
 * `https://api.github.com/repos` → `http://localhost:3128/https://api.github.com/repos`
 *
 * When disabled, requests pass through to the native fetch unchanged.
 *
 * @param input - URL or Request object
 * @param init - Optional fetch init options
 * @param proxyConfig - Proxy configuration with enabled flag and port
 * @returns Promise resolving to Response
 *
 * @example
 * ```typescript
 * const response = await proxyFetch(
 *   'https://api.github.com/repos/owner/repo',
 *   { headers: { Accept: 'application/json' } },
 *   { enabled: true, port: 3128 }
 * );
 * ```
 */
export async function proxyFetch(
  input: ProxyFetchInput,
  init: RequestInit | undefined,
  proxyConfig: ProxyFetchConfig | undefined,
): Promise<Response> {
  const url = input instanceof Request ? input.url : input.toString();
  const targetUrl = proxyConfig?.enabled ? `http://localhost:${proxyConfig.port}/${url}` : url;

  if (input instanceof Request) {
    return fetch(targetUrl, {
      method: input.method,
      headers: input.headers,
      body: input.body,
      mode: input.mode,
      credentials: input.credentials,
      cache: input.cache,
      redirect: input.redirect,
      referrer: input.referrer,
      integrity: input.integrity,
      ...init,
    });
  }

  return fetch(targetUrl, init);
}
