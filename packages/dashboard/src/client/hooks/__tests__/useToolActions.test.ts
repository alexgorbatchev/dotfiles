import { setupUITests } from "../../../testing/ui-setup";

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, renderHook } from "@testing-library/preact";

import { useToolActions } from "../useToolActions";

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

describe("useToolActions", () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("starts idle with no outcome", () => {
    const { result } = renderHook(() => useToolActions());

    expect(result.current.pending).toBeNull();
    expect(result.current.outcome).toBeNull();
  });

  test("reports the installer error and clears pending", async () => {
    mockApiData({ installed: false, error: "Refusing to load cask from untrusted tap" });

    const { result } = renderHook(() => useToolActions());
    await act(() => result.current.installTool("aerospace", false));

    expect(result.current.outcome).toEqual({
      toolName: "aerospace",
      kind: "install",
      message: "Refusing to load cask from untrusted tap",
      tone: "error",
    });
    expect(result.current.pending).toBeNull();
  });

  test("falls back to a generic message when the installer fails without one", async () => {
    mockApiData({ installed: false });

    const { result } = renderHook(() => useToolActions());
    await act(() => result.current.installTool("aerospace", false));

    expect(result.current.outcome).toEqual({
      toolName: "aerospace",
      kind: "install",
      message: "Installation failed",
      tone: "error",
    });
  });

  test("surfaces a transport failure as an install error", async () => {
    mockApiFailure("boom");

    const { result } = renderHook(() => useToolActions());
    await act(() => result.current.installTool("aerospace", false));

    expect(result.current.outcome).toEqual({
      toolName: "aerospace",
      kind: "install",
      message: "boom",
      tone: "error",
    });
  });

  test("reports the update error when the update is unsupported", async () => {
    mockApiData({ updated: false, supported: false, error: "Update not supported" });

    const { result } = renderHook(() => useToolActions());
    await act(() => result.current.updateTool("eza"));

    expect(result.current.outcome).toEqual({
      toolName: "eza",
      kind: "update",
      message: "Update not supported",
      tone: "error",
    });
  });

  test("reports an available update as an informational outcome", async () => {
    mockApiData({ hasUpdate: true, currentVersion: "0.1.0", latestVersion: "0.2.0", supported: true });

    const { result } = renderHook(() => useToolActions());
    await act(() => result.current.checkTool("eza"));

    expect(result.current.outcome).toEqual({
      toolName: "eza",
      kind: "check",
      message: "Update available: 0.1.0 → 0.2.0",
      tone: "info",
    });
  });

  test("reports an up-to-date tool as a success outcome", async () => {
    mockApiData({ hasUpdate: false, currentVersion: "0.2.0", latestVersion: "0.2.0", supported: true });

    const { result } = renderHook(() => useToolActions());
    await act(() => result.current.checkTool("eza"));

    expect(result.current.outcome).toEqual({
      toolName: "eza",
      kind: "check",
      message: "Up to date (0.2.0)",
      tone: "success",
    });
  });

  test("reports an unsupported update check as an error", async () => {
    mockApiData({
      hasUpdate: false,
      currentVersion: "?",
      latestVersion: "?",
      supported: false,
      error: "Not supported",
    });

    const { result } = renderHook(() => useToolActions());
    await act(() => result.current.checkTool("eza"));

    expect(result.current.outcome).toEqual({
      toolName: "eza",
      kind: "check",
      message: "Not supported",
      tone: "error",
    });
  });

  // The tree disables every row button off `pending`, so the in-flight window has to be observable.
  test("marks the tool pending for the duration of the install", async () => {
    let sendResponse: SendResponse = () => {};
    const inFlight = new Promise<Response>((resolve) => {
      sendResponse = resolve;
    });
    const mockFn = mock(() => inFlight);
    globalThis.fetch = Object.assign(mockFn, { preconnect: () => {} }) as typeof fetch;

    const { result } = renderHook(() => useToolActions());

    let installed: Promise<void> = Promise.resolve();
    act(() => {
      installed = result.current.installTool("aerospace", true);
    });

    expect(result.current.pending).toEqual({ toolName: "aerospace", kind: "install" });

    await act(async () => {
      sendResponse(new Response(JSON.stringify({ success: true, data: { installed: false, error: "denied" } })));
      await installed;
    });

    expect(result.current.pending).toBeNull();
  });
});
