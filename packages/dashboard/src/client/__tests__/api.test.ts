import { afterEach, describe, expect, mock, test } from "bun:test";
import { fetchApi, postApi } from "../api";

type FooData = { foo: string };
type OkData = { ok: boolean };
type IdBody = { id: number };

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

    expect(fetchApi("/test")).rejects.toThrow("Something went wrong");
  });

  test("fetchApi throws default error message when error string is missing", async () => {
    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({ success: false }));
    }) as unknown as typeof fetch;

    expect(fetchApi("/test")).rejects.toThrow("API error");
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

    expect(postApi("/post-test", {})).rejects.toThrow("Post failed");
  });
});
