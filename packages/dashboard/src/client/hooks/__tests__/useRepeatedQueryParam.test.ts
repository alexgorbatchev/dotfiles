// UI test setup - registers DOM and exports testing utilities
import { fireEvent, render, screen, setupUITests } from "../../../testing/ui-setup";

import { h } from "preact";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { useRepeatedQueryParam } from "../useRepeatedQueryParam";

setupUITests();

const originalLocation = window.location;
const originalReplaceState = window.history.replaceState;

function TestComponent() {
  const [values, setValues] = useRepeatedQueryParam("treeCollapsed");

  return h(
    "div",
    {},
    h("div", { "data-testid": "values" }, Array.from(values).join(",")),
    h("button", { onClick: () => setValues(["/tmp/dev"]) }, "Set"),
    h(
      "button",
      {
        onClick: () =>
          setValues((previousValues) => {
            const nextValues = new Set(previousValues);
            nextValues.delete("/tmp/dev");
            return nextValues;
          }),
      },
      "Clear",
    ),
  );
}

describe("useRepeatedQueryParam", () => {
  beforeEach(() => {
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
    });
    window.history.replaceState = originalReplaceState;
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
    });
    window.history.replaceState = originalReplaceState;
  });

  test("hydrates values from the current URL", () => {
    Object.defineProperty(window, "location", {
      value: { href: "http://localhost/?treeCollapsed=%2Ftmp%2Fdev&treeCollapsed=%2Ftmp%2Finfra" },
      writable: true,
    });

    render(h(TestComponent, {}));

    expect(screen.getByTestId("values")).toHaveTextContent("/tmp/dev,/tmp/infra");
  });

  test("syncs values when popstate event fires", () => {
    Object.defineProperty(window, "location", {
      value: { href: "http://localhost/" },
      writable: true,
    });

    const { unmount } = render(h(TestComponent, {}));

    Object.defineProperty(window, "location", {
      value: { href: "http://localhost/?treeCollapsed=%2Ftmp%2Fsync" },
      writable: true,
    });

    fireEvent(window, new Event("popstate"));

    expect(screen.getByTestId("values")).toHaveTextContent("/tmp/sync");

    unmount();
  });
  test("setting and clearing a disclosure preserves unrelated URL state", () => {
    const location = { href: "http://localhost/?query=bat#tool-files" };
    Object.defineProperty(window, "location", { value: location, writable: true });
    const replacements: string[] = [];
    window.history.replaceState = (_data, _unused, url) => {
      location.href = new URL(String(url), location.href).href;
      replacements.push(location.href);
    };
    render(h(TestComponent, {}));
    fireEvent.click(screen.getByRole("button", { name: "Set" }));
    expect(screen.getByTestId("values")).toHaveTextContent("/tmp/dev");
    expect(new URL(location.href).searchParams.get("treeCollapsed")).toBe("/tmp/dev");
    expect(new URL(location.href).searchParams.get("query")).toBe("bat");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByTestId("values").textContent).toBe("");
    expect(new URL(location.href).searchParams.has("treeCollapsed")).toBe(false);
    expect(new URL(location.href).hash).toBe("#tool-files");
    expect(replacements).toHaveLength(2);
  });
});
