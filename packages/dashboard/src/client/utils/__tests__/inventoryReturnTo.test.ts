import { expect, test } from "bun:test";
import { inventoryReturnTo } from "../inventoryReturnTo";

test.each(["/", "/?q=bat&status=installed&method=brew&root=%2Ftools&sort=name", "/?q=a%20b&q=c"])(
  "preserves the inventory URL %s exactly",
  (target) => {
    expect(inventoryReturnTo(`?returnTo=${encodeURIComponent(target)}&filesCollapsed=a`)).toBe(target);
  },
);

test.each([
  "https://example.com/",
  "//example.com/",
  "/tools/bat",
  "/#source",
  "/\\evil",
  "/?q=a\nb",
  "javascript:alert(1)",
  "",
  "/?q=ok#source",
])("rejects non-inventory navigation %s", (target) => {
  expect(inventoryReturnTo(`?returnTo=${encodeURIComponent(target)}`)).toBe("/");
});

test("direct visits return to the inventory", () => {
  expect(inventoryReturnTo("?filesCollapsed=/home")).toBe("/");
});
