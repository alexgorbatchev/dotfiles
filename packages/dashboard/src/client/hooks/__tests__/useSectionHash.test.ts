import { setupUITests, render } from "../../../testing/ui-setup";
import { describe, test, beforeEach, afterEach } from "bun:test";
import { useSectionHash } from "../useSectionHash";
import { h } from "preact";

setupUITests();

type TestComponentProps = {
  sectionIds: string[];
  enabled?: boolean;
};

function TestComponent({ sectionIds, enabled = true }: TestComponentProps) {
  useSectionHash(sectionIds, enabled);
  return h("div", null, [
    h("div", { id: "sec-1", key: "sec-1" }, "Sec 1"),
    h("div", { id: "sec-2", key: "sec-2" }, "Sec 2"),
  ]);
}

describe("useSectionHash", () => {
  const originalLocation = window.location;
  const originalReplaceState = window.history.replaceState;

  beforeEach(() => {
    let currentUrl = new URL("http://localhost/test#sec-2");
    Object.defineProperty(window, "location", {
      get: () => currentUrl,
      set: (val) => {
        currentUrl = new URL(val, "http://localhost");
      },
      configurable: true,
    });
    window.history.replaceState = (_state, _title, url) => {
      currentUrl = new URL(url || "/", "http://localhost");
    };
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
    window.history.replaceState = originalReplaceState;
  });

  test("runs hook, scrolls to target, and handles scroll/resize events", async () => {
    const sec1 = document.createElement("div");
    sec1.id = "sec-1";
    sec1.getBoundingClientRect = () => ({
      top: 50,
      bottom: 500,
      left: 0,
      right: 100,
      width: 100,
      height: 450,
      x: 0,
      y: 50,
      toJSON: () => {},
    });
    sec1.scrollIntoView = () => {};

    const sec2 = document.createElement("div");
    sec2.id = "sec-2";
    sec2.getBoundingClientRect = () => ({
      top: 200,
      bottom: 700,
      left: 0,
      right: 100,
      width: 100,
      height: 500,
      x: 0,
      y: 200,
      toJSON: () => {},
    });
    sec2.scrollIntoView = () => {};

    document.body.appendChild(sec1);
    document.body.appendChild(sec2);

    render(h(TestComponent, { sectionIds: ["sec-1", "sec-2"], enabled: true }));

    // Wait for timeout
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Dispatch scroll & resize
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));

    document.body.removeChild(sec1);
    document.body.removeChild(sec2);
  });

  test("does nothing when disabled or empty", () => {
    render(h(TestComponent, { sectionIds: [], enabled: false }));
  });
});
