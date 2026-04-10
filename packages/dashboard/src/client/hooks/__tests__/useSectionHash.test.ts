// UI test setup - registers DOM and exports testing utilities
import { render, setupUITests } from "../../../testing/ui-setup";

import assert from "node:assert";
import { h } from "preact";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { useSectionHash } from "../useSectionHash";

setupUITests();

type CancelAnimationFrame = typeof window.cancelAnimationFrame;
type HistoryReplaceState = typeof window.history.replaceState;
type HistoryReplaceStateMock = ReturnType<typeof mock<HistoryReplaceState>>;
type RequestAnimationFrame = typeof window.requestAnimationFrame;
type ScrollIntoView = typeof HTMLElement.prototype.scrollIntoView;

const originalCancelAnimationFrame = window.cancelAnimationFrame;
const originalLocation = window.location;
const originalReplaceState = window.history.replaceState;
const originalRequestAnimationFrame = window.requestAnimationFrame;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

function createReplaceStateSpy(): HistoryReplaceStateMock {
  return mock<HistoryReplaceState>(function replaceState() {});
}

function createScrollIntoViewSpy(): ScrollIntoView {
  return mock(function scrollIntoView() {}) as ScrollIntoView;
}

function TestComponent() {
  useSectionHash(["overview", "files"]);

  return h("div", {}, h("section", { id: "overview" }, "Overview"), h("section", { id: "files" }, "Files"));
}

describe("useSectionHash", () => {
  beforeEach(() => {
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
    });
    window.history.replaceState = originalReplaceState;
    window.requestAnimationFrame = ((callback) => {
      callback(0);
      return 1;
    }) as RequestAnimationFrame;
    window.cancelAnimationFrame = (() => {}) as CancelAnimationFrame;
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
    });
    window.history.replaceState = originalReplaceState;
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  test("restores the hash target into view on mount", async () => {
    const scrollIntoViewSpy = createScrollIntoViewSpy();

    Object.defineProperty(window, "location", {
      value: { href: "http://localhost/tools/fzf#files", hash: "#files" },
      writable: true,
    });
    HTMLElement.prototype.scrollIntoView = scrollIntoViewSpy;

    render(h(TestComponent, {}));

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(scrollIntoViewSpy).toHaveBeenCalled();
  });

  test("updates the URL hash for the current section", async () => {
    const replaceStateSpy = createReplaceStateSpy();

    Object.defineProperty(window, "location", {
      value: { href: "http://localhost/tools/fzf", hash: "" },
      writable: true,
    });
    window.history.replaceState = replaceStateSpy as HistoryReplaceState;

    render(h(TestComponent, {}));

    const overview = document.getElementById("overview");
    const files = document.getElementById("files");
    assert(overview);
    assert(files);

    overview.getBoundingClientRect = () => ({ top: -20 }) as DOMRect;
    files.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(String(replaceStateSpy.mock.calls.at(-1)?.[2] ?? "")).toContain("#files");
  });
});
