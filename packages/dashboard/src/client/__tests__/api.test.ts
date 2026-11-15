import { afterEach, describe, expect, mock, test } from "bun:test";
import { fetchApi, postApi } from "../api";
import { fixture_configurationTool } from "./fixtures";
import type { IToolDetail } from "../../shared/types";

type FooData = { foo: string };
type OkData = { ok: boolean };
type IdBody = { id: number };
type PayloadCase = [string, unknown];
type ValidPayloadCase = [string, object];

describe("api client utilities", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("fetchApi returns data on success", async () => {
    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({ success: true, data: { foo: "bar" } }));
    }) as unknown as typeof fetch;

    const res = await fetchApi<FooData>("/test");
    expect(res).toEqual({ foo: "bar" });
  });

  test("fetchApi throws on error response", async () => {
    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({ success: false, error: "Something went wrong" }));
    }) as unknown as typeof fetch;

    await expect(fetchApi("/test")).rejects.toThrow("Something went wrong");
  });

  test("fetchApi throws default error message when error string is missing", async () => {
    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({ success: false }));
    }) as unknown as typeof fetch;

    await expect(fetchApi("/test")).rejects.toThrow("API error");
  });

  test("fetchApi throws when a successful envelope carries no data", async () => {
    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({ success: true }));
    }) as unknown as typeof fetch;

    await expect(fetchApi("/test")).rejects.toThrow("API error");
  });

  test("postApi sends body and returns data on success", async () => {
    let capturedMethod = "";
    let capturedBody = "";

    globalThis.fetch = mock(async (_url, init) => {
      capturedMethod = init?.method || "";
      capturedBody = init?.body as string;
      return new Response(JSON.stringify({ success: true, data: { ok: true } }));
    }) as unknown as typeof fetch;

    const res = await postApi<OkData, IdBody>("/post-test", { id: 123 });
    expect(res).toEqual({ ok: true });
    expect(capturedMethod).toBe("POST");
    expect(capturedBody).toBe(JSON.stringify({ id: 123 }));
  });

  test("postApi throws on error response", async () => {
    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({ success: false, error: "Post failed" }));
    }) as unknown as typeof fetch;

    await expect(postApi("/post-test", {})).rejects.toThrow("Post failed");
  });
});

describe("API response validation", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test.each([{ body: null }, { body: [] }, { body: "invalid" }, { body: {} }, { body: { success: "true", data: [] } }])(
    "rejects malformed envelopes %#",
    async ({ body }) => {
      globalThis.fetch = mock(async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;
      await expect(fetchApi("/tools")).rejects.toThrow("Invalid API response");
    },
  );

  test("rejects null data rather than reporting empty success", async () => {
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify({ success: true, data: null })),
    ) as unknown as typeof fetch;
    await expect(fetchApi("/tools")).rejects.toThrow("API error");
  });

  test("does not accept a successful body on an HTTP failure", async () => {
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify({ success: true, data: [] }), { status: 503 }),
    ) as unknown as typeof fetch;
    await expect(fetchApi("/tools")).rejects.toThrow("Request failed (HTTP 503)");
  });

  test("preserves server diagnostics on an HTTP failure", async () => {
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify({ success: false, error: "Registry unavailable" }), { status: 500 }),
    ) as unknown as typeof fetch;
    await expect(fetchApi("/tools")).rejects.toThrow("Registry unavailable");
    await expect(postApi("/tools/tool/install", {})).rejects.toThrow("Registry unavailable");
  });

  test("rejects invalid JSON", async () => {
    globalThis.fetch = mock(async () => new Response("<html>Unavailable</html>")) as unknown as typeof fetch;
    await expect(fetchApi("/tools")).rejects.toBeInstanceOf(SyntaxError);
  });

  test.each<PayloadCase>([
    ["/tools", {}],
    ["/tools", [{}]],
    ["/config", { version: "1" }],
    ["/health", { overall: "mystery", checks: [], lastCheck: "now" }],
    [
      "/health",
      { overall: "healthy", checks: [{ name: "Registry", status: "mystery", message: "Unknown" }], lastCheck: "now" },
    ],
    ["/recent-tools", { tools: [null] }],
    [
      "/tool-configs-tree",
      {
        roots: [
          {
            label: "tools",
            path: "/tools",
            entries: [{ name: "nested", path: "/tools/nested", type: "directory", children: [null] }],
          },
        ],
      },
    ],
    ["/tools/example/history", { entries: [], totalCount: 0 }],
    ["/tools/example/source", { content: 42, filePath: "/tool.ts" }],
    ["/tools/example/readme", { content: null }],
  ])("rejects malformed payload for %s %#", async (endpoint, data) => {
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify({ success: true, data })),
    ) as unknown as typeof fetch;
    await expect(fetchApi(endpoint)).rejects.toThrow(`Invalid response data for ${endpoint}`);
  });

  test.each<ValidPayloadCase>([
    ["/tools", []],
    ["/recent-tools?limit=5", { tools: [] }],
    ["/tool-configs-tree", { roots: [] }],
    ["/tools/example/history", { entries: [], totalCount: 0, installedAt: null, dotfilesDir: "" }],
    ["/tools/example/source", { content: "", filePath: "" }],
    ["/tools/example/readme", { content: "" }],
    ["/health", { overall: "healthy", checks: [], lastCheck: "2026-11-15T06:00:00Z", extra: true }],
  ])("preserves valid empty data and extra fields for %s", async (endpoint, data) => {
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify({ success: true, data })),
    ) as unknown as typeof fetch;
    expect(await fetchApi<object>(endpoint)).toEqual(data);
  });
});

describe("existing Go wire shapes", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("accepts omitted inactive installer fields and null recorded binary paths", async () => {
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify({ success: true, data: [fixture_configurationTool] })),
    ) as unknown as typeof fetch;
    expect(await fetchApi<IToolDetail[]>("/tools")).toEqual([fixture_configurationTool]);
  });

  test.each(["install", "update", "check-update"])("rejects malformed successful %s results", async (operation) => {
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify({ success: true, data: {} })),
    ) as unknown as typeof fetch;
    await expect(postApi(`/tools/example/${operation}`, {})).rejects.toThrow(
      `Invalid response data for /tools/example/${operation}`,
    );
  });

  test("rejects a successful installation without the recorded version", async () => {
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify({ success: true, data: { installed: true } })),
    ) as unknown as typeof fetch;
    await expect(postApi("/tools/example/install", {})).rejects.toThrow(
      "Invalid response data for /tools/example/install",
    );
  });

  test.each<ValidPayloadCase>([
    ["install", { installed: true, version: "1", alreadyInstalled: false }],
    ["install", { installed: false, error: "Install failed" }],
    [
      "update",
      {
        updated: false,
        oldVersion: "1",
        newVersion: "1",
        status: "up-to-date",
        latestVersion: "1",
        reinstalled: false,
      },
    ],
    [
      "check-update",
      { currentVersion: "1", latestVersion: "unknown", status: "unsupported", error: "No update source" },
    ],
  ])("accepts the existing %s result contract", async (operation, data) => {
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify({ success: true, data })),
    ) as unknown as typeof fetch;
    expect(await postApi<object>(`/tools/example/${operation}`, {})).toEqual(data);
  });
});
