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

  test("reports an update with the versions installed before and after", async () => {
    mockApiData({
      updated: true,
      oldVersion: "0.1.0",
      newVersion: "0.2.0",
      status: "update-available",
      latestVersion: "0.2.0",
      reinstalled: true,
    });

    const { result } = renderHook(() => useToolActions());
    await act(() => result.current.updateTool("eza"));

    expect(result.current.outcome).toEqual({
      toolName: "eza",
      kind: "update",
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

    const { result } = renderHook(() => useToolActions());
    await act(() => result.current.updateTool("eza"));

    expect(result.current.outcome).toEqual({
      toolName: "eza",
      kind: "update",
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

    const { result } = renderHook(() => useToolActions());
    await act(() => result.current.updateTool("eza"));

    expect(result.current.outcome).toEqual({
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

    const { result } = renderHook(() => useToolActions());
    await act(() => result.current.updateTool("eza"));

    expect(result.current.outcome).toEqual({
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

    const { result } = renderHook(() => useToolActions());
    await act(() => result.current.updateTool("eza"));

    expect(result.current.outcome).toEqual({
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

    const { result } = renderHook(() => useToolActions());
    await act(() => result.current.updateTool("eza"));

    expect(result.current.outcome).toEqual({
      toolName: "eza",
      kind: "update",
      message: "3.0.0-alpha.2 is ahead of the latest known version (2.11.6)",
      tone: "info",
    });
  });

  test("surfaces a failed update as an update error", async () => {
    mockApiFailure('Update failed: checking update for "eza": API rate limit exceeded');

    const { result } = renderHook(() => useToolActions());
    await act(() => result.current.updateTool("eza"));

    expect(result.current.outcome).toEqual({
      toolName: "eza",
      kind: "update",
      message: 'Update failed: checking update for "eza": API rate limit exceeded',
      tone: "error",
    });
  });

  test("reports an available update as an informational outcome", async () => {
    mockApiData({ status: "update-available", currentVersion: "0.1.0", latestVersion: "0.2.0" });

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
    mockApiData({ status: "up-to-date", currentVersion: "0.2.0", latestVersion: "0.2.0" });

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
    mockApiData({ status: "unsupported", currentVersion: "?", latestVersion: "?", error: "Not supported" });

    const { result } = renderHook(() => useToolActions());
    await act(() => result.current.checkTool("eza"));

    expect(result.current.outcome).toEqual({
      toolName: "eza",
      kind: "check",
      message: "Not supported",
      tone: "error",
    });
  });

  // An unsupported check compared nothing, which must never read as "Up to date".
  test("reports an unsupported update check that gives no reason as unsupported", async () => {
    mockApiData({ status: "unsupported", currentVersion: "0.2.0", latestVersion: "unknown" });

    const { result } = renderHook(() => useToolActions());
    await act(() => result.current.checkTool("eza"));

    expect(result.current.outcome).toEqual({
      toolName: "eza",
      kind: "check",
      message: "Update checking is not supported for this tool",
      tone: "error",
    });
  });

  // An installation newer than the latest release is neither current nor outdated (#130).
  test("reports an installation ahead of the latest release as its own status", async () => {
    mockApiData({ status: "ahead-of-latest", currentVersion: "3.0.0-alpha.2", latestVersion: "2.11.6" });

    const { result } = renderHook(() => useToolActions());
    await act(() => result.current.checkTool("eza"));

    expect(result.current.outcome).toEqual({
      toolName: "eza",
      kind: "check",
      message: "3.0.0-alpha.2 is ahead of the latest known version (2.11.6)",
      tone: "info",
    });
  });

  test("dismisses outcome when dismissOutcome is called", async () => {
    mockApiData({ status: "up-to-date", currentVersion: "0.2.0", latestVersion: "0.2.0" });

    const { result } = renderHook(() => useToolActions());
    await act(() => result.current.checkTool("eza"));

    expect(result.current.outcome).not.toBeNull();

    act(() => {
      result.current.dismissOutcome();
    });

    expect(result.current.outcome).toBeNull();
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
