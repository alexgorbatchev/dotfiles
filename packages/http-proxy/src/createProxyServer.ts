import type { Server } from "bun";

import { CacheInvalidator } from "./CacheInvalidator";
import { ProxyCacheStore } from "./ProxyCacheStore";
import type {
  CacheClearRequest,
  CachePopulateRequest,
  CachePopulateResult,
  ProxyCacheStatus,
  ProxyConfig,
  ProxyServerAddress,
  ProxyServerCallback,
} from "./types";

/**
 * Extended config with optional fetch override for testing.
 */
export interface ProxyServerOptions extends ProxyConfig {
  /** Custom fetch function for testing. Defaults to globalThis.fetch */
  fetchFn?: typeof fetch;
}

/**
 * Result from creating a proxy server - provides listen/close interface compatible with tests.
 */
export interface ProxyServer {
  /** Start listening on specified port. Callback receives server info. */
  listen(port: number, callback?: ProxyServerCallback): ProxyServer;
  /** Stop the server */
  close(callback?: ProxyServerCallback): void;
  /** Get server address info */
  address(): ProxyServerAddress | null;
}

/**
 * Skipped headers that shouldn't be forwarded in responses.
 */
const SKIP_HEADERS = new Set(["transfer-encoding", "content-encoding", "content-length"]);

/**
 * Get current timestamp in HH:MM:SS format.
 */
function getTimestamp(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Creates the HTTP caching proxy server using Bun.serve.
 * Proxies requests while caching responses, ignoring server cache headers.
 */
export function createProxyServer(config: ProxyServerOptions): ProxyServer {
  const store = new ProxyCacheStore(config.cacheDir, config.ttl);
  const invalidator = new CacheInvalidator(store);
  const fetchFn = config.fetchFn ?? globalThis.fetch;

  let bunServer: Server<unknown> | null = null;

  /**
   * Handle cache clear requests.
   */
  function handleCacheClear(body: CacheClearRequest): Response {
    const patterns: string[] = [];

    if (body.pattern) {
      patterns.push(body.pattern);
    }
    if (body.patterns) {
      patterns.push(...body.patterns);
    }

    const result = invalidator.clear(patterns);
    return Response.json(result);
  }

  /**
   * Handle cache stats requests.
   */
  function handleCacheStats(): Response {
    const stats = store.getStats();
    return Response.json(stats);
  }

  /**
   * Handle cache populate requests.
   */
  function handleCachePopulate(body: CachePopulateRequest): Response {
    if (!body.url) {
      return Response.json({ success: false, message: "Missing required field: url" }, { status: 400 });
    }

    if (body.body === undefined) {
      return Response.json({ success: false, message: "Missing required field: body" }, { status: 400 });
    }

    const method = body.method ?? "GET";
    const status = body.status ?? 200;
    const headers = body.headers ?? {};
    const bodyBuffer = body.bodyIsBase64 ? Buffer.from(body.body, "base64") : Buffer.from(body.body, "utf-8");

    store.set(method, body.url, status, headers, bodyBuffer, body.ttl);

    const key = store.generateKey(method, body.url);
    const result: CachePopulateResult = {
      success: true,
      key,
      url: body.url,
      message: `Cached ${method} ${body.url}`,
    };
    return Response.json(result);
  }

  /**
   * Build response headers, filtering out problematic ones.
   */
  function buildResponseHeaders(
    headers: Record<string, string>,
    cacheStatus: ProxyCacheStatus,
    contentLength: number,
  ): Headers {
    const responseHeaders = new Headers();
    for (const [key, value] of Object.entries(headers)) {
      if (!SKIP_HEADERS.has(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    }
    responseHeaders.set("X-Dotfiles-Cache", cacheStatus);
    responseHeaders.set("Content-Length", String(contentLength));
    return responseHeaders;
  }

  /**
   * Handle proxy requests.
   */
  async function handleProxy(req: Request): Promise<Response> {
    const url = new URL(req.url);
    let targetUrl = url.pathname + url.search;

    // Handle CONNECT requests (HTTPS tunneling) - not supported
    if (req.method === "CONNECT") {
      return new Response("HTTPS tunneling not supported", { status: 501 });
    }

    // Handle URLs like /https://... or /http://... - strip the leading slash
    if (targetUrl.startsWith("/https://") || targetUrl.startsWith("/http://")) {
      targetUrl = targetUrl.slice(1);
    } else if (targetUrl.startsWith("/") && !targetUrl.startsWith("//")) {
      // If URL starts with / and is not a protocol URL, it's a relative request
      const host = req.headers.get("host");
      if (!host) {
        return new Response("Missing Host header", { status: 400 });
      }
      const protocol = url.protocol === "https:" ? "https" : "http";
      targetUrl = `${protocol}://${host}${targetUrl}`;
    }

    const method = req.method;

    // Check cache first
    const cached = store.get(method, targetUrl);
    if (cached) {
      // Log cache hit - intentional console output for proxy visibility
      // oxlint-disable-next-line no-console
      console.log(`🟢 [${getTimestamp()}] [${method}] ${targetUrl}`);

      const responseHeaders = buildResponseHeaders(cached.headers, "HIT", cached.body.length);

      return new Response(new Uint8Array(cached.body), {
        status: cached.status,
        headers: responseHeaders,
      });
    }

    // Forward request to target
    try {
      // Log cache miss - intentional console output for proxy visibility
      // oxlint-disable-next-line no-console
      console.log(`🔴 [${getTimestamp()}] [${method}] ${targetUrl}`);

      const headers: Record<string, string> = {};
      req.headers.forEach((value, key) => {
        if (!["host", "connection"].includes(key.toLowerCase())) {
          headers[key] = value;
        }
      });

      const fetchResponse = await fetchFn(targetUrl, {
        method,
        headers,
        body: ["GET", "HEAD"].includes(method) ? undefined : await req.arrayBuffer(),
      });

      const responseHeaders: Record<string, string> = {};
      fetchResponse.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const bodyBuffer = Buffer.from(await fetchResponse.arrayBuffer());

      // Cache the response (ignore server cache headers - always cache)
      // Only cache successful responses
      if (fetchResponse.status >= 200 && fetchResponse.status < 400) {
        store.set(method, targetUrl, fetchResponse.status, responseHeaders, bodyBuffer, config.ttl);
      }

      const finalHeaders = buildResponseHeaders(responseHeaders, "MISS", bodyBuffer.length);

      return new Response(bodyBuffer, {
        status: fetchResponse.status,
        headers: finalHeaders,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return Response.json({ error: "Bad Gateway", message }, { status: 502 });
    }
  }

  /**
   * Route definitions for the proxy server.
   */
  const routes = {
    "/cache/clear": {
      POST: async (req: Request) => {
        const body = (await req.json()) as CacheClearRequest;
        return handleCacheClear(body);
      },
    },
    "/cache/stats": {
      GET: () => handleCacheStats(),
    },
    "/cache/populate": {
      POST: async (req: Request) => {
        const body = (await req.json()) as CachePopulateRequest;
        return handleCachePopulate(body);
      },
    },
  } as const;

  // Return a server-like object that can be started/stopped
  const proxyServer: ProxyServer = {
    listen(port: number, callback?: ProxyServerCallback): ProxyServer {
      bunServer = Bun.serve({
        port,
        routes,
        fetch: handleProxy,
      });
      if (callback) {
        callback();
      }
      return proxyServer;
    },

    close(callback?: ProxyServerCallback): void {
      if (bunServer) {
        bunServer.stop();
        bunServer = null;
      }
      if (callback) {
        callback();
      }
    },

    address(): ProxyServerAddress | null {
      if (bunServer && bunServer.port !== undefined) {
        return { port: bunServer.port };
      }
      return null;
    },
  };

  return proxyServer;
}
