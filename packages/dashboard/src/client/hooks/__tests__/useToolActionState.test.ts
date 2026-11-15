import { act, renderHook, setupUITests } from "../../../testing/ui-setup";

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { useToolActionState } from "../useToolActionState";
import { subscribeFetchInvalidation } from "../../invalidateFetches";

setupUITests();

type SendResponse = (response: Response) => void;

const originalFetch = globalThis.fetch;

function mockFetchResponse(body: unknown): void {
  const mockFn = mock(async () => new Response(JSON.stringify(body)));
  globalThis.fetch = Object.assign(mockFn, { preconnect: () => {} }) as typeof fetch;
}

function mockApiData(payload: unknown): void {
  mockFetchResponse({ success: true, data: payload });
}

function mockApiFailure(error: string): void {
  mockFetchResponse({ success: false, error });
}

describe("useToolActionState", () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("starts idle with no outcome", () => {
    const { result } = renderHook(() => useToolActionState());

    expect(result.current.pending).toBeNull();
    expect(result.current.results.at(-1)?.outcome).toBeUndefined();
  });

  test("reports the installer error and clears pending", async () => {
    mockApiData({ installed: false, error: "Refusing to load cask from untrusted tap" });

    const { result } = renderHook(() => useToolActionState());
    await act(() => result.current.installTool("aerospace", false));

    expect(result.current.results.at(-1)?.outcome).toEqual({
      toolName: "aerospace",
      kind: "install",
      message: "Refusing to load cask from untrusted tap",
      tone: "error",
    });
    expect(result.current.pending).toBeNull();
  });

  test("falls back to a generic message when the installer fails without one", async () => {
    mockApiData({ installed: false });

    const { result } = renderHook(() => useToolActionState());
    await act(() => result.current.installTool("aerospace", false));

    expect(result.current.results.at(-1)?.outcome).toEqual({
      toolName: "aerospace",
      kind: "install",
      message: "Installation failed",
      tone: "error",
    });
  });

  test("surfaces a transport failure as an install error", async () => {
    mockApiFailure("boom");

    const { result } = renderHook(() => useToolActionState());
    await act(() => result.current.installTool("aerospace", false));

    expect(result.current.results.at(-1)?.outcome).toEqual({
      toolName: "aerospace",
      kind: "install",
      message: "boom",
      tone: "error",
    });
  });

  test("reports an update with the versions installed before and after", async () => {
    mockApiData({
      updated: true,
      oldVersion: "0.1.0",
      newVersion: "0.2.0",
      status: "update-available",
      latestVersion: "0.2.0",
      reinstalled: true,
    });

    const { result } = renderHook(() => useToolActionState());
    await act(() => result.current.updateTool("eza"));

    expect(result.current.results.at(-1)?.outcome).toEqual({
      toolName: "eza",
      kind: "update",
      latestVersion: "0.2.0",
      checkedAt: expect.any(String),
      message: "Updated 0.1.0 → 0.2.0",
      tone: "success",
    });
  });

  // An update that found nothing newer installed nothing, which is not a failure.
  test("reports a tool with no newer release as up to date", async () => {
    mockApiData({
      updated: false,
      oldVersion: "0.2.0",
      newVersion: "0.2.0",
      status: "up-to-date",
      latestVersion: "0.2.0",
      reinstalled: false,
    });

    const { result } = renderHook(() => useToolActionState());
    await act(() => result.current.updateTool("eza"));

    expect(result.current.results.at(-1)?.outcome).toEqual({
      toolName: "eza",
      kind: "update",
      latestVersion: "0.2.0",
      checkedAt: expect.any(String),
      message: "Already up to date (0.2.0)",
      tone: "success",
    });
  });

  // An installer that cannot check upstream is reinstalled unchecked, which must not read as "up to date".
  test("reports an unchecked reinstall that kept the version as a reinstall", async () => {
    mockApiData({
      updated: false,
      oldVersion: "0.2.0",
      newVersion: "0.2.0",
      status: "unsupported",
      latestVersion: "unknown",
      reinstalled: true,
    });

    const { result } = renderHook(() => useToolActionState());
    await act(() => result.current.updateTool("eza"));

    expect(result.current.results.at(-1)?.outcome).toEqual({
      toolName: "eza",
      kind: "update",
      message: "Reinstalled 0.2.0; update checking is not supported for this tool",
      tone: "info",
    });
  });

  // With no version to detect, an unchecked reinstall records a fresh timestamp, which is no evidence of a newer release.
  test("reports an unchecked reinstall that recorded a new version as a reinstall", async () => {
    mockApiData({
      updated: true,
      oldVersion: "2026-01-01-00-00-00",
      newVersion: "2026-09-23-00-00-00",
      status: "unsupported",
      latestVersion: "unknown",
      reinstalled: true,
    });

    const { result } = renderHook(() => useToolActionState());
    await act(() => result.current.updateTool("eza"));

    expect(result.current.results.at(-1)?.outcome).toEqual({
      toolName: "eza",
      kind: "update",
      message: "Reinstalled 2026-09-23-00-00-00; update checking is not supported for this tool",
      tone: "info",
    });
  });

  // A package manager can report the tool outdated and still leave the recorded version unchanged.
  test("reports a checked reinstall that kept the version as a reinstall", async () => {
    mockApiData({
      updated: false,
      oldVersion: "0.2.0",
      newVersion: "0.2.0",
      status: "update-available",
      latestVersion: "unknown",
      reinstalled: true,
    });

    const { result } = renderHook(() => useToolActionState());
    await act(() => result.current.updateTool("eza"));

    expect(result.current.results.at(-1)?.outcome).toEqual({
      toolName: "eza",
      kind: "update",
      message: "Reinstalled 0.2.0",
      tone: "success",
    });
  });

  // An update never moves an installation back to an older latest release, nor calls it current (#130).
  test("reports an installation ahead of the latest release as its own status", async () => {
    mockApiData({
      updated: false,
      oldVersion: "3.0.0-alpha.2",
      newVersion: "3.0.0-alpha.2",
      status: "ahead-of-latest",
      latestVersion: "2.11.6",
      reinstalled: false,
    });

    const { result } = renderHook(() => useToolActionState());
    await act(() => result.current.updateTool("eza"));

    expect(result.current.results.at(-1)?.outcome).toEqual({
      toolName: "eza",
      kind: "update",
      latestVersion: "2.11.6",
      checkedAt: expect.any(String),
      message: "3.0.0-alpha.2 is ahead of the latest known version (2.11.6)",
      tone: "info",
    });
  });

  test("surfaces a failed update as an update error", async () => {
    mockApiFailure('Update failed: checking update for "eza": API rate limit exceeded');

    const { result } = renderHook(() => useToolActionState());
    await act(() => result.current.updateTool("eza"));

    expect(result.current.results.at(-1)?.outcome).toEqual({
      toolName: "eza",
      kind: "update",
      message: 'Update failed: checking update for "eza": API rate limit exceeded',
      tone: "error",
    });
  });

  test("reports an available update as an informational outcome", async () => {
    mockApiData({ status: "update-available", currentVersion: "0.1.0", latestVersion: "0.2.0" });

    const { result } = renderHook(() => useToolActionState());
    await act(() => result.current.checkTool("eza"));

    expect(result.current.results.at(-1)?.outcome).toEqual({
      toolName: "eza",
      kind: "check",
      latestVersion: "0.2.0",
      checkedAt: expect.any(String),
      message: "Update available: 0.1.0 → 0.2.0",
      tone: "info",
    });
  });

  test("reports an up-to-date tool as a success outcome", async () => {
    mockApiData({ status: "up-to-date", currentVersion: "0.2.0", latestVersion: "0.2.0" });

    const { result } = renderHook(() => useToolActionState());
    await act(() => result.current.checkTool("eza"));

    expect(result.current.results.at(-1)?.outcome).toEqual({
      toolName: "eza",
      kind: "check",
      latestVersion: "0.2.0",
      checkedAt: expect.any(String),
      message: "Up to date (0.2.0)",
      tone: "success",
    });
  });

  test("reports an unsupported update check as an error", async () => {
    mockApiData({ status: "unsupported", currentVersion: "?", latestVersion: "?", error: "Not supported" });

    const { result } = renderHook(() => useToolActionState());
    await act(() => result.current.checkTool("eza"));

    expect(result.current.results.at(-1)?.outcome).toEqual({
      toolName: "eza",
      kind: "check",
      message: "Not supported",
      tone: "error",
    });
  });

  // An unsupported check compared nothing, which must never read as "Up to date".
  test("reports an unsupported update check that gives no reason as unsupported", async () => {
    mockApiData({ status: "unsupported", currentVersion: "0.2.0", latestVersion: "unknown" });

    const { result } = renderHook(() => useToolActionState());
    await act(() => result.current.checkTool("eza"));

    expect(result.current.results.at(-1)?.outcome).toEqual({
      toolName: "eza",
      kind: "check",
      message: "Update checking is not supported for this tool",
      tone: "error",
    });
  });

  // An installation newer than the latest release is neither current nor outdated (#130).
  test("reports an installation ahead of the latest release as its own status", async () => {
    mockApiData({ status: "ahead-of-latest", currentVersion: "3.0.0-alpha.2", latestVersion: "2.11.6" });

    const { result } = renderHook(() => useToolActionState());
    await act(() => result.current.checkTool("eza"));

    expect(result.current.results.at(-1)?.outcome).toEqual({
      toolName: "eza",
      kind: "check",
      latestVersion: "2.11.6",
      checkedAt: expect.any(String),
      message: "3.0.0-alpha.2 is ahead of the latest known version (2.11.6)",
      tone: "info",
    });
  });

  // A tool dotfiles never installed is neither outdated nor a failed check (#151).
  test("reports a tool that is not installed with the latest release", async () => {
    mockApiData({ status: "not-installed", currentVersion: "unknown", latestVersion: "1.6.0" });

    const { result } = renderHook(() => useToolActionState());
    await act(() => result.current.checkTool("eza"));

    expect(result.current.results.at(-1)?.outcome).toEqual({
      toolName: "eza",
      kind: "check",
      latestVersion: "1.6.0",
      checkedAt: expect.any(String),
      message: "Not installed; the latest available version is 1.6.0",
      tone: "info",
    });
  });

  test("reports a tool that is not installed when no latest release could be named", async () => {
    mockApiData({ status: "not-installed", currentVersion: "unknown", latestVersion: "unknown" });

    const { result } = renderHook(() => useToolActionState());
    await act(() => result.current.checkTool("eza"));

    expect(result.current.results.at(-1)?.outcome).toEqual({
      toolName: "eza",
      kind: "check",
      message: "Not installed",
      tone: "info",
    });
  });

  test("dismisses a retained result", async () => {
    mockApiData({ status: "up-to-date", currentVersion: "0.2.0", latestVersion: "0.2.0" });

    const { result } = renderHook(() => useToolActionState());
    await act(() => result.current.checkTool("eza"));

    expect(result.current.results).toHaveLength(1);

    act(() => {
      result.current.dismissResult(1);
    });

    expect(result.current.results).toHaveLength(0);
  });

  // The tree disables every row button off `pending`, so the in-flight window has to be observable.
  test("marks the tool pending for the duration of the install", async () => {
    let sendResponse: SendResponse = () => {};
    const inFlight = new Promise<Response>((resolve) => {
      sendResponse = resolve;
    });
    const mockFn = mock(() => inFlight);
    globalThis.fetch = Object.assign(mockFn, { preconnect: () => {} }) as typeof fetch;

    const { result } = renderHook(() => useToolActionState());

    let installed: Promise<void> = Promise.resolve();
    act(() => {
      installed = result.current.installTool("aerospace", true);
    });

    expect(result.current.pending).toEqual({
      toolName: "aerospace",
      kind: "install",
      force: true,
      startedAt: expect.any(Number),
    });

    await act(async () => {
      sendResponse(new Response(JSON.stringify({ success: true, data: { installed: false, error: "denied" } })));
      await installed;
    });

    expect(result.current.pending).toBeNull();
  });
});

describe("operation ownership", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("ignores a second action before the pending state renders", async () => {
    const response = Promise.withResolvers<Response>();
    const fetchMock = mock(() => response.promise);
    globalThis.fetch = Object.assign(fetchMock, { preconnect: () => {} }) as typeof fetch;
    const { result } = renderHook(() => useToolActionState());
    let first = Promise.resolve();
    act(() => {
      first = result.current.installTool("bat", false);
      void result.current.updateTool("eza");
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      response.resolve(new Response(JSON.stringify({ success: true, data: { installed: true, version: "1.2.3" } })));
      await first;
    });
    expect(result.current.results).toHaveLength(1);
    expect(result.current.results[0]?.outcome.message).toBe("Installed 1.2.3");
  });

  test("retains earlier results during subsequent operations and dismisses only the selected result", async () => {
    mockApiData({ status: "up-to-date", currentVersion: "1.0", latestVersion: "1.0" });
    const { result } = renderHook(() => useToolActionState());
    await act(() => result.current.checkTool("bat"));
    await act(() => result.current.checkTool("eza"));
    expect(result.current.results.map((entry) => entry.outcome.toolName)).toEqual(["bat", "eza"]);
    act(() => result.current.dismissResult(1));
    expect(result.current.results.map((entry) => entry.outcome.toolName)).toEqual(["eza"]);
  });

  test("retries the exact failed request including force and retains both attempts", async () => {
    const fetchMock = mock(async () => new Response(JSON.stringify({ success: false, error: "Network unavailable" })));
    globalThis.fetch = Object.assign(fetchMock, { preconnect: () => {} }) as typeof fetch;
    const { result } = renderHook(() => useToolActionState());
    await act(() => result.current.installTool("tool/name", true));
    await act(() => result.current.retryResult(1));
    expect(fetchMock.mock.calls).toHaveLength(2);
    expect(fetchMock.mock.calls[0]).toEqual(fetchMock.mock.calls[1]);
    expect(result.current.results.map((entry) => entry.request)).toEqual([
      { toolName: "tool/name", kind: "install", force: true },
      { toolName: "tool/name", kind: "install", force: true },
    ]);
  });

  test("does not retry a successful or dismissed result", async () => {
    const fetchMock = mock(
      async () => new Response(JSON.stringify({ success: true, data: { installed: true, version: "2.0" } })),
    );
    globalThis.fetch = Object.assign(fetchMock, { preconnect: () => {} }) as typeof fetch;
    const { result } = renderHook(() => useToolActionState());
    await act(() => result.current.installTool("bat", false));
    await act(() => result.current.retryResult(1));
    act(() => result.current.dismissResult(1));
    await act(() => result.current.retryResult(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("inventory invalidation", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test.each([true, false])("refreshes mounted queries after an install finishes (installed=%s)", async (installed) => {
    mockApiData({ installed, version: "2.0" });
    const refreshed = mock(() => {});
    const unsubscribe = subscribeFetchInvalidation(refreshed);
    try {
      const { result } = renderHook(() => useToolActionState());
      await act(() => result.current.installTool("bat", false));
      expect(refreshed).toHaveBeenCalledWith([]);
      expect(result.current.results).toHaveLength(1);
    } finally {
      unsubscribe();
    }
  });

  test("does not invalidate inventory for a read-only version check", async () => {
    mockApiData({ status: "up-to-date", currentVersion: "1.0", latestVersion: "1.0" });
    const refreshed = mock(() => {});
    const unsubscribe = subscribeFetchInvalidation(refreshed);
    try {
      const { result } = renderHook(() => useToolActionState());
      await act(() => result.current.checkTool("bat"));
      expect(refreshed).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });
});
