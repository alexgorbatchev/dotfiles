import { setupUITests } from "../../../testing/ui-setup";
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { readQueryParamValues, writeQueryParamValues, readHash, writeHash } from "../urlState";

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
