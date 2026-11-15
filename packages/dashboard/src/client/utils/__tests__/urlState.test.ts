import { setupUITests } from "../../../testing/ui-setup";
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { readHash, readQueryParamValues, writeHash, writeQueryParamValues } from "../urlState";

setupUITests();

describe("urlState", () => {
  const originalLocation = window.location;
  const originalReplaceState = window.history.replaceState;

  beforeEach(() => {
    let currentUrl = new URL("http://localhost/test");
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

  test("readQueryParamValues and writeQueryParamValues work correctly", () => {
    writeQueryParamValues("tag", ["foo", "bar", "foo"]);
    const values = readQueryParamValues("tag");
    expect(Array.from(values)).toEqual(["bar", "foo"]);
  });

  test("readHash and writeHash work correctly", () => {
    writeHash("section-1");
    expect(readHash()).toBe("section-1");

    writeHash("section-1");
    expect(readHash()).toBe("section-1");
  });

  test("malformed deep links do not crash the page and can be replaced by navigation", () => {
    window.location.href = "http://localhost/tools/example?returnTo=%2F#%E0%A4%A";
    expect(readHash()).toBe("%E0%A4%A");
    writeHash("drift");
    expect(window.location.href).toBe("http://localhost/tools/example?returnTo=%2F#drift");
  });

  test("handles null url gracefully", () => {
    Object.defineProperty(window, "location", {
      get: () => {
        return { href: "" } as Location;
      },
      configurable: true,
    });
    expect(readQueryParamValues("param")).toEqual(new Set());
    writeQueryParamValues("param", ["v1"]);
    writeHash("h1");
  });
});
