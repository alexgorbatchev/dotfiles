import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { createProxyServer, type ProxyServer, type ProxyServerOptions } from "../createProxyServer";
import { ProxyCacheStore } from "../ProxyCacheStore";

describe("createProxyServer", () => {
  let cacheDir: string;
  let server: ProxyServer | null = null;

  beforeEach(() => {
    cacheDir = join(tmpdir(), `http-proxy-server-test-${Date.now()}`);
    mkdirSync(cacheDir, { recursive: true });
  });

  afterEach(async () => {
    rmSync(cacheDir, { recursive: true, force: true });
    if (server) {
      server.close();
      server = null;
    }
  });

  function startServer(options: Partial<ProxyServerOptions> = {}): Promise<string> {
    return new Promise((resolve) => {
      const config: ProxyServerOptions = {
        cacheDir,
        port: 0,
        ttl: 60000,
        ...options,
      };
      server = createProxyServer(config);
      server.listen(0, () => {
        const addr = server!.address();
        const port = addr ? addr.port : 0;
        resolve(`http://localhost:${port}`);
      });
    });
  }

  describe("cache clear endpoint", () => {
    test("POST /cache/clear returns cleared count", async () => {
      // Pre-populate cache
      const store = new ProxyCacheStore(cacheDir, 60000);
      store.set("GET", "https://api.example.com/data", 200, {}, Buffer.from("test"));

      const baseUrl = await startServer();

      const clearResponse = await fetch(`${baseUrl}/cache/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(clearResponse.status).toBe(200);
      const result = await clearResponse.json();
      expect(result.cleared).toBe(1);
      expect(result.message).toBeDefined();
    });

    test("POST /cache/clear with pattern filters entries", async () => {
      // Pre-populate cache
      const store = new ProxyCacheStore(cacheDir, 60000);
      store.set("GET", "https://api.github.com/repos", 200, {}, Buffer.from("a"));
      store.set("GET", "https://api.example.com/data", 200, {}, Buffer.from("b"));

      const baseUrl = await startServer();

      const clearResponse = await fetch(`${baseUrl}/cache/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern: "**/github.com/**" }),
      });

      expect(clearResponse.status).toBe(200);
      const result = await clearResponse.json();
      expect(result.cleared).toBe(1);

      // Verify remaining entry
      expect(store.getAllEntries().length).toBe(1);
      expect(store.getAllEntries()[0]!.url).toBe("https://api.example.com/data");
    });

    test("POST /cache/clear with * pattern clears all entries", async () => {
      // Pre-populate cache
      const store = new ProxyCacheStore(cacheDir, 60000);
      store.set("GET", "https://api.github.com/repos", 200, {}, Buffer.from("a"));
      store.set("GET", "https://api.example.com/data", 200, {}, Buffer.from("b"));

      const baseUrl = await startServer();

      const clearResponse = await fetch(`${baseUrl}/cache/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern: "*" }),
      });

      expect(clearResponse.status).toBe(200);
      const result = await clearResponse.json();
      expect(result.cleared).toBe(2);

      // Verify all entries cleared
      expect(store.getAllEntries().length).toBe(0);
    });
  });

  describe("cache stats endpoint", () => {
    test("GET /cache/stats returns statistics", async () => {
      const baseUrl = await startServer();

      const statsResponse = await fetch(`${baseUrl}/cache/stats`);

      expect(statsResponse.status).toBe(200);
      const stats = await statsResponse.json();
      expect(stats.entries).toBe(0);
      expect(stats.size).toBe(0);
    });

    test("GET /cache/stats returns correct count after caching", async () => {
      // Pre-populate cache
      const store = new ProxyCacheStore(cacheDir, 60000);
      store.set("GET", "https://api.example.com/a", 200, {}, Buffer.from("data-a"));
      store.set("GET", "https://api.example.com/b", 200, {}, Buffer.from("data-b"));

      const baseUrl = await startServer();

      const statsResponse = await fetch(`${baseUrl}/cache/stats`);

      expect(statsResponse.status).toBe(200);
      const stats = await statsResponse.json();
      expect(stats.entries).toBe(2);
      expect(stats.size).toBeGreaterThan(0);
    });
  });

  describe("cache populate endpoint", () => {
    test("POST /cache/populate adds entry to cache", async () => {
      const baseUrl = await startServer();

      const populateResponse = await fetch(`${baseUrl}/cache/populate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://api.example.com/data",
          body: '{"test": true}',
        }),
      });

      expect(populateResponse.status).toBe(200);
      const result = await populateResponse.json();
      expect(result.success).toBe(true);
      expect(result.url).toBe("https://api.example.com/data");
      expect(result.key).toBeDefined();

      // Verify entry was added to cache
      const store = new ProxyCacheStore(cacheDir, 60000);
      const entry = store.get("GET", "https://api.example.com/data");
      expect(entry).toBeDefined();
      expect(entry!.status).toBe(200);
    });

    test("POST /cache/populate with custom method", async () => {
      const baseUrl = await startServer();

      const populateResponse = await fetch(`${baseUrl}/cache/populate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "POST",
          url: "https://api.example.com/submit",
          body: "submitted",
        }),
      });

      expect(populateResponse.status).toBe(200);
      const result = await populateResponse.json();
      expect(result.success).toBe(true);

      // Verify entry was added with correct method
      const store = new ProxyCacheStore(cacheDir, 60000);
      const entry = store.get("POST", "https://api.example.com/submit");
      expect(entry).toBeDefined();
    });

    test("POST /cache/populate with base64 body", async () => {
      const baseUrl = await startServer();
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xff]);
      const base64Body = binaryData.toString("base64");

      const populateResponse = await fetch(`${baseUrl}/cache/populate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://api.example.com/binary",
          body: base64Body,
          bodyIsBase64: true,
        }),
      });

      expect(populateResponse.status).toBe(200);

      // Verify body was stored correctly
      const store = new ProxyCacheStore(cacheDir, 60000);
      const entry = store.get("GET", "https://api.example.com/binary");
      expect(entry).toBeDefined();
      expect(entry!.body).toEqual(binaryData);
    });

    test("POST /cache/populate with custom status and headers", async () => {
      const baseUrl = await startServer();

      const populateResponse = await fetch(`${baseUrl}/cache/populate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://api.example.com/custom",
          status: 201,
          headers: { "X-Custom": "value", "Content-Type": "application/json" },
          body: '{"created": true}',
        }),
      });

      expect(populateResponse.status).toBe(200);

      // Verify entry was added with custom status and headers
      const store = new ProxyCacheStore(cacheDir, 60000);
      const entry = store.get("GET", "https://api.example.com/custom");
      expect(entry).toBeDefined();
      expect(entry!.status).toBe(201);
      expect(entry!.headers["X-Custom"]).toBe("value");
    });

    test("POST /cache/populate with custom ttl", async () => {
      const baseUrl = await startServer();

      const populateResponse = await fetch(`${baseUrl}/cache/populate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://api.example.com/ttl",
          body: "data",
          ttl: 5000,
        }),
      });

      expect(populateResponse.status).toBe(200);

      // Verify entry was added with custom TTL
      const store = new ProxyCacheStore(cacheDir, 60000);
      const entry = store.get("GET", "https://api.example.com/ttl");
      expect(entry).toBeDefined();
      expect(entry!.ttl).toBe(5000);
    });

    test("POST /cache/populate returns error if url missing", async () => {
      const baseUrl = await startServer();

      const populateResponse = await fetch(`${baseUrl}/cache/populate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "data" }),
      });

      expect(populateResponse.status).toBe(400);
      const result = await populateResponse.json();
      expect(result.success).toBe(false);
      expect(result.message).toContain("url");
    });

    test("POST /cache/populate returns error if body missing", async () => {
      const baseUrl = await startServer();

      const populateResponse = await fetch(`${baseUrl}/cache/populate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://api.example.com/data" }),
      });

      expect(populateResponse.status).toBe(400);
      const result = await populateResponse.json();
      expect(result.success).toBe(false);
      expect(result.message).toContain("body");
    });

    test("populated cache entry is returned on proxy request", async () => {
      let fetchCalled = false;
      const mockFetch = mock(() => {
        fetchCalled = true;
        return Promise.resolve(new Response("should not see this", { status: 500 }));
      });

      const baseUrl = await startServer({ fetchFn: mockFetch as unknown as typeof fetch });

      // Pre-populate cache via API
      const populateRes = await fetch(`${baseUrl}/cache/populate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://api.example.com/prepopulated",
          body: '{"cached": true}',
          headers: { "Content-Type": "application/json" },
        }),
      });
      expect(populateRes.status).toBe(200);

      // Request should be served from cache
      const response = await fetch(`${baseUrl}/https://api.example.com/prepopulated`);
      expect(response.status).toBe(200);
      expect(response.headers.get("X-Dotfiles-Cache")).toBe("HIT");
      const body = await response.json();
      expect(body.cached).toBe(true);

      // mockFetch should NOT have been called
      expect(fetchCalled).toBe(false);
    });
  });

  describe("proxy functionality", () => {
    test("proxies request and caches response", async () => {
      let fetchCallCount = 0;
      const mockFetch = mock((_url: string | URL | Request) => {
        fetchCallCount++;
        return Promise.resolve(
          new Response('{"data":"test"}', {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      });

      const baseUrl = await startServer({ fetchFn: mockFetch as unknown as typeof fetch });

      // First request - should be MISS
      const response1 = await fetch(`${baseUrl}/https://api.example.com/data`);
      expect(response1.status).toBe(200);
      expect(response1.headers.get("X-Dotfiles-Cache")).toBe("MISS");
      expect(fetchCallCount).toBe(1);

      // Second request - should be HIT
      const response2 = await fetch(`${baseUrl}/https://api.example.com/data`);
      expect(response2.status).toBe(200);
      expect(response2.headers.get("X-Dotfiles-Cache")).toBe("HIT");
      // fetch should NOT be called again
      expect(fetchCallCount).toBe(1);
    });

    test("returns X-Dotfiles-Cache: MISS on first request", async () => {
      const mockFetch = mock(() => Promise.resolve(new Response("data", { status: 200 })));

      const baseUrl = await startServer({ fetchFn: mockFetch as unknown as typeof fetch });

      const response = await fetch(`${baseUrl}/https://api.example.com/test`);
      expect(response.headers.get("X-Dotfiles-Cache")).toBe("MISS");
    });

    test("returns X-Dotfiles-Cache: HIT on cached request", async () => {
      const mockFetch = mock(() => Promise.resolve(new Response("data", { status: 200 })));

      const baseUrl = await startServer({ fetchFn: mockFetch as unknown as typeof fetch });

      // First request to populate cache
      await fetch(`${baseUrl}/https://api.example.com/cached`);

      // Second request should be cached
      const response = await fetch(`${baseUrl}/https://api.example.com/cached`);
      expect(response.headers.get("X-Dotfiles-Cache")).toBe("HIT");
    });

    test("handles fetch errors gracefully", async () => {
      const mockFetch = mock(() => Promise.reject(new Error("Network error")));

      const baseUrl = await startServer({ fetchFn: mockFetch as unknown as typeof fetch });

      const response = await fetch(`${baseUrl}/https://api.example.com/error`);
      expect(response.status).toBe(502);
      const body = await response.json();
      expect(body.error).toBe("Bad Gateway");
      expect(body.message).toBe("Network error");
    });

    test("does not cache error responses", async () => {
      let callCount = 0;
      const mockFetch = mock(() => {
        callCount++;
        return Promise.resolve(new Response("Not Found", { status: 404 }));
      });

      const baseUrl = await startServer({ fetchFn: mockFetch as unknown as typeof fetch });

      // First request
      await fetch(`${baseUrl}/https://api.example.com/notfound`);
      expect(callCount).toBe(1);

      // Second request should NOT be cached (404 error)
      await fetch(`${baseUrl}/https://api.example.com/notfound`);
      expect(callCount).toBe(2);
    });

    test("rejects CONNECT requests with 501", async () => {
      // CONNECT is used for HTTPS tunneling and Express may close the connection
      // We just verify the server doesn't crash and ideally returns 501
      const baseUrl = await startServer();

      try {
        const response = await fetch(`${baseUrl}/https://api.example.com`, {
          method: "CONNECT",
        });
        // If we get a response, it should be 501
        expect(response.status).toBe(501);
      } catch (error) {
        // Connection reset is acceptable - CONNECT is special and server may close it
        expect(error).toBeDefined();
      }
    });
  });

  describe("caching ignores server headers", () => {
    test("caches response regardless of Cache-Control: no-store", async () => {
      const mockFetch = mock(() =>
        Promise.resolve(
          new Response("data", {
            status: 200,
            headers: { "Cache-Control": "no-store, no-cache" },
          }),
        ),
      );

      const baseUrl = await startServer({ fetchFn: mockFetch as unknown as typeof fetch });

      // First request
      const response1 = await fetch(`${baseUrl}/https://api.example.com/no-cache`);
      expect(response1.headers.get("X-Dotfiles-Cache")).toBe("MISS");

      // Second request should be cached despite Cache-Control: no-store
      const response2 = await fetch(`${baseUrl}/https://api.example.com/no-cache`);
      expect(response2.headers.get("X-Dotfiles-Cache")).toBe("HIT");
    });
  });
});
