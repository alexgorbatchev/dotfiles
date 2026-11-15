import { act, renderHook, setupUITests, waitFor } from "../../../testing/ui-setup";
import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { useSectionHash } from "../useSectionHash";

setupUITests();

const originalLocation = window.location;
const originalReplaceState = window.history.replaceState;
const scrollYDescriptor = Object.getOwnPropertyDescriptor(window, "scrollY");

beforeEach(() => {
  let url = new URL("http://localhost/tools/example?returnTo=%2F%3Fq%3Dbat");
  Object.defineProperty(window, "location", {
    configurable: true,
    get: () => url,
    set: (value) => {
      url = new URL(value, url);
    },
  });
  window.history.replaceState = (_state, _title, value) => {
    url = new URL(String(value), url);
  };
  Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: 0 });
  document.body.innerHTML =
    '<section id="overview"></section><section id="drift"></section><details id="source"><summary>Source</summary><p>Reference content</p></details>';
});
afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, writable: true, value: originalLocation });
  Object.defineProperty(window, "scrollY", scrollYDescriptor ?? { configurable: true, value: 0 });
  window.history.replaceState = originalReplaceState;
});

describe("useSectionHash", () => {
  test("opens a deep-linked disclosure, then follows hash navigation and browser history", async () => {
    window.location.hash = "#source";
    const scroll = spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
    const { result } = renderHook(() => useSectionHash(["overview", "drift", "source"]));
    await waitFor(() => expect(document.getElementById("source")?.hasAttribute("open")).toBe(true));
    expect(result.current.activeSection).toBe("source");
    expect(scroll).toHaveBeenCalledWith({ block: "start" });
    window.location.hash = "#drift";
    act(() => {
      window.dispatchEvent(new Event("hashchange"));
    });
    expect(result.current.activeSection).toBe("drift");
    window.location.hash = "#source";
    act(() => {
      window.dispatchEvent(new Event("popstate"));
    });
    expect(result.current.activeSection).toBe("source");
    expect(window.location.search).toBe("?returnTo=%2F%3Fq%3Dbat");
    document.getElementById("source")?.removeAttribute("open");
    act(() => result.current.revealSection("source"));
    expect(document.getElementById("source")?.hasAttribute("open")).toBe(true);
    act(() => result.current.revealSection("missing"));
    expect(result.current.activeSection).toBe("source");
    scroll.mockRestore();
  });

  test("scrolling to drift updates the hash and preserves query state", async () => {
    const overview = document.getElementById("overview")!;
    const drift = document.getElementById("drift")!;
    const source = document.getElementById("source")!;
    spyOn(overview, "getBoundingClientRect").mockReturnValue(new DOMRect(0, -200, 300, 180));
    spyOn(drift, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 20, 300, 300));
    spyOn(source, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 400, 300, 300));
    const { result, unmount } = renderHook(() => useSectionHash(["overview", "drift", "source"]));
    await act(async () => {});
    window.scrollY = 200;
    act(() => {
      window.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("resize"));
    });
    await waitFor(() => expect(window.location.hash).toBe("#drift"));
    expect(result.current.activeSection).toBe("drift");
    expect(window.location.search).toBe("?returnTo=%2F%3Fq%3Dbat");
    spyOn(overview, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 300, 180));
    spyOn(drift, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 200, 300, 300));
    window.scrollY = 0;
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(result.current.activeSection).toBe("overview");
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    const cancel = spyOn(window, "cancelAnimationFrame");
    unmount();
    expect(cancel).toHaveBeenCalledTimes(1);
    cancel.mockRestore();
  });

  test("keeps an explicitly chosen bottom anchor until the scroll position changes", async () => {
    window.location.hash = "#source";
    const { result } = renderHook(() => useSectionHash(["overview", "drift", "source"]));
    await waitFor(() => expect(result.current.activeSection).toBe("source"));
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(window.location.hash).toBe("#source");
  });

  test("ignores unknown hashes and missing/disabled section lists", async () => {
    window.location.hash = "#%E0%A4%A";
    const { result } = renderHook(() => useSectionHash(["overview", "missing"]));
    await act(async () => {});
    expect(result.current.activeSection).toBe("overview");
    expect(window.location.hash).toBe("#%E0%A4%A");
    const disabled = renderHook(() => useSectionHash(["source"], false));
    const missing = renderHook(() => useSectionHash(["absent"]));
    expect(document.getElementById("source")?.hasAttribute("open")).toBe(false);
    disabled.unmount();
    missing.unmount();
  });
});
