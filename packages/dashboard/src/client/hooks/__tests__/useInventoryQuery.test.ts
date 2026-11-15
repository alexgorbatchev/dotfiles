import { act, renderHook, setupUITests } from "../../../testing/ui-setup";
import { afterEach, expect, test } from "bun:test";
import { useInventoryQuery } from "../useInventoryQuery";

setupUITests();
const originalLocation = window.location;
const originalReplace = window.history.replaceState;
afterEach(() => {
  Object.defineProperty(window, "location", { value: originalLocation, writable: true });
  window.history.replaceState = originalReplace;
});

test("inventory navigation preserves unrelated query, hash and history state while resetting only its controls", () => {
  const location = new URL("http://localhost/?keep=yes&q=initial#tool-files");
  Object.defineProperty(window, "location", { value: location, writable: true });
  const replacements: string[] = [];
  window.history.replaceState = (_data, _unused, url) => {
    location.href = new URL(String(url), location).href;
    replacements.push(location.href);
  };
  const { result, unmount } = renderHook(() => useInventoryQuery());
  expect(result.current.query.q).toBe("initial");
  act(() => result.current.updateQuery({ status: "installed", q: "a & b" }));
  expect(result.current.returnTo).toBe("/?keep=yes&q=a+%26+b&status=installed");
  expect(location.hash).toBe("#tool-files");
  act(() => result.current.resetQuery());
  expect(location.search).toBe("?keep=yes");
  expect(result.current.query.status).toBe("");
  act(() => {
    location.search = "?root=%2Fwork&sort=name-desc";
    window.dispatchEvent(new Event("popstate"));
  });
  expect(result.current.query.root).toBe("/work");
  expect(result.current.query.sort).toBe("name-desc");
  expect(replacements).toHaveLength(2);
  unmount();
  act(() => {
    window.dispatchEvent(new Event("popstate"));
  });
});
