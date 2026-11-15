import { act, renderHook, setupUITests, waitFor } from "../../../testing/ui-setup";

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { invalidateFetches } from "../../invalidateFetches";
import { useFetch } from "../useFetch";

setupUITests();
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function response(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }));
}

describe("useFetch request lifecycle", () => {
  test("reports an initial network failure and recovers through a stable retry", async () => {
    const fetchMock = spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Offline"));
    const { result } = renderHook(() => useFetch<string[]>("/test-resource"));
    const retry = result.current.refetch;
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.error?.message).toBe("Offline"));
    expect(result.current.data).toBeNull();
    expect(result.current.stale).toBe(false);
    fetchMock.mockResolvedValueOnce(response([]));
    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.refetch).toBe(retry);
  });

  test("keeps data visible during refresh and marks a failed refresh stale", async () => {
    const refresh = Promise.withResolvers<Response>();
    const fetchMock = spyOn(globalThis, "fetch").mockResolvedValueOnce(response(["saved"]));
    const { result } = renderHook(() => useFetch<string[]>("/test-resource"));
    await waitFor(() => expect(result.current.data).toEqual(["saved"]));
    fetchMock.mockReturnValueOnce(refresh.promise);
    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.data).toEqual(["saved"]);
    await act(async () => refresh.reject(new Error("Refresh failed")));
    await waitFor(() => expect(result.current.error?.message).toBe("Refresh failed"));
    expect(result.current.data).toEqual(["saved"]);
    expect(result.current.stale).toBe(true);
    fetchMock.mockResolvedValueOnce(response(["new"]));
    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.data).toEqual(["new"]));
    expect(result.current.stale).toBe(false);
  });

  test("clears the prior resource immediately and ignores its late response", async () => {
    const first = Promise.withResolvers<Response>();
    const second = Promise.withResolvers<Response>();
    const fetchMock = spyOn(globalThis, "fetch").mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook((endpoint: string) => useFetch<string[]>(endpoint), {
      initialProps: "/first",
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const firstSignal = fetchMock.mock.calls[0]?.[1]?.signal;
    rerender("/second");
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(firstSignal?.aborted).toBe(true);
    await act(async () => second.resolve(response(["second"])));
    await waitFor(() => expect(result.current.data).toEqual(["second"]));
    await act(async () => first.resolve(response(["first"])));
    expect(result.current.data).toEqual(["second"]);
  });

  test("never displays the last successful resource under a new endpoint", async () => {
    const pending = Promise.withResolvers<Response>();
    spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(["first"]))
      .mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook((endpoint: string) => useFetch<string[]>(endpoint), {
      initialProps: "/first",
    });
    await waitFor(() => expect(result.current.data).toEqual(["first"]));
    rerender("/second");
    expect(result.current.data).toBeNull();
    await act(async () => pending.reject(new Error("Second unavailable")));
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.error?.message).toBe("Second unavailable"));
  });

  test("ignores superseded retries even when a transport does not honor abort", async () => {
    const first = Promise.withResolvers<Response>();
    const second = Promise.withResolvers<Response>();
    const fetchMock = spyOn(globalThis, "fetch").mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useFetch<string[]>("/test-resource"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => result.current.refetch());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => second.resolve(response(["latest"])));
    await waitFor(() => expect(result.current.data).toEqual(["latest"]));
    await act(async () => first.reject(new Error("Old failure")));
    expect(result.current.data).toEqual(["latest"]);
    expect(result.current.error).toBeNull();
  });

  test("refreshes only matching mounted endpoints and unsubscribes on unmount", async () => {
    const fetchMock = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(async () => response([]), { preconnect: () => {} }),
    );
    const first = renderHook(() => useFetch<string[]>("/first"));
    const second = renderHook(() => useFetch<string[]>("/second"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    act(() => invalidateFetches("/first"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/first");
    first.unmount();
    second.unmount();
    act(() => invalidateFetches());
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("invalidates all mounted endpoints without discarding successful data", async () => {
    const fetchMock = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(async () => response(["data"]), { preconnect: () => {} }),
    );
    const first = renderHook(() => useFetch<string[]>("/first"));
    const second = renderHook(() => useFetch<string[]>("/second"));
    await waitFor(() => expect(first.result.current.data).toEqual(["data"]));
    await waitFor(() => expect(second.result.current.data).toEqual(["data"]));
    act(() => invalidateFetches());
    expect(first.result.current.data).toEqual(["data"]);
    expect(second.result.current.data).toEqual(["data"]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  });

  test("cancels a pending request on unmount", async () => {
    const pending = Promise.withResolvers<Response>();
    const fetchMock = spyOn(globalThis, "fetch").mockReturnValueOnce(pending.promise);
    const { unmount } = renderHook(() => useFetch<string[]>("/test-resource"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const signal = fetchMock.mock.calls[0]?.[1]?.signal;
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve(response(["late"])));
  });

  test("treats dependency changes as a new resource and normalizes non-Error failures", async () => {
    const fetchMock = spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(["old"]))
      .mockRejectedValueOnce("Offline");
    const { result, rerender } = renderHook((name: string) => useFetch<string[]>("/test-resource", [name]), {
      initialProps: "first",
    });
    await waitFor(() => expect(result.current.data).toEqual(["old"]));
    rerender("second");
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.error?.message).toBe("Offline"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
