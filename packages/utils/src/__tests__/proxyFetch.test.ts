import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

import { proxyFetch, type ProxyFetchConfig } from "../proxyFetch";

describe("proxyFetch", () => {
  let mockFetch: ReturnType<typeof spyOn>;

  beforeEach(() => {
    mockFetch = spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
  });

  afterEach(() => {
    mock.restore();
  });

  describe("when proxy is disabled", () => {
    test("calls fetch with original URL", async () => {
      await proxyFetch("https://api.github.com/repos/owner/repo", undefined, { enabled: false, port: 3128 });

      expect(mockFetch).toHaveBeenCalledWith("https://api.github.com/repos/owner/repo", undefined);
    });

    test("calls fetch with original URL when config is undefined", async () => {
      await proxyFetch("https://api.github.com/repos/owner/repo", undefined, undefined);

      expect(mockFetch).toHaveBeenCalledWith("https://api.github.com/repos/owner/repo", undefined);
    });
  });

  describe("when proxy is enabled", () => {
    const proxyConfig: ProxyFetchConfig = { enabled: true, port: 3128 };

    test("rewrites HTTPS URL to go through proxy", async () => {
      await proxyFetch("https://api.github.com/repos/owner/repo", undefined, proxyConfig);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3128/https://api.github.com/repos/owner/repo",
        undefined,
      );
    });

    test("rewrites HTTP URL to go through proxy", async () => {
      await proxyFetch("http://example.com/file.zip", undefined, proxyConfig);

      expect(mockFetch).toHaveBeenCalledWith("http://localhost:3128/http://example.com/file.zip", undefined);
    });

    test("uses custom port from config", async () => {
      await proxyFetch("https://api.github.com/repos", undefined, { enabled: true, port: 8080 });

      expect(mockFetch).toHaveBeenCalledWith("http://localhost:8080/https://api.github.com/repos", undefined);
    });

    test("preserves request init options", async () => {
      const init: RequestInit = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: "test" }),
      };

      await proxyFetch("https://api.github.com/repos", init, proxyConfig);

      expect(mockFetch).toHaveBeenCalledWith("http://localhost:3128/https://api.github.com/repos", init);
    });

    test("handles URL object input", async () => {
      const url = new URL("https://api.github.com/repos/owner/repo");

      await proxyFetch(url, undefined, proxyConfig);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3128/https://api.github.com/repos/owner/repo",
        undefined,
      );
    });

    test("handles Request object input", async () => {
      const request = new Request("https://api.github.com/repos", {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      await proxyFetch(request, undefined, proxyConfig);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [calledUrl] = mockFetch.mock.calls[0]!;
      expect(calledUrl).toBe("http://localhost:3128/https://api.github.com/repos");
    });

    test("returns response from fetch", async () => {
      const expectedResponse = new Response("test data", { status: 200 });
      mockFetch.mockResolvedValue(expectedResponse);

      const response = await proxyFetch("https://api.github.com/repos", undefined, proxyConfig);

      expect(response).toBe(expectedResponse);
    });

    test("handles URLs with query strings", async () => {
      await proxyFetch("https://api.github.com/repos?page=1&per_page=100", undefined, proxyConfig);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3128/https://api.github.com/repos?page=1&per_page=100",
        undefined,
      );
    });

    test("handles URLs with fragments", async () => {
      await proxyFetch("https://example.com/page#section", undefined, proxyConfig);

      expect(mockFetch).toHaveBeenCalledWith("http://localhost:3128/https://example.com/page#section", undefined);
    });
  });
});
