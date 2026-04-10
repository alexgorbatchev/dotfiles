// UI test setup - registers DOM and exports testing utilities
import { fireEvent, render, screen, setupUITests } from "../../../testing/ui-setup";

import { h } from "preact";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { useRepeatedQueryParam } from "../useRepeatedQueryParam";

setupUITests();

type HistoryReplaceState = typeof window.history.replaceState;
type HistoryReplaceStateMock = ReturnType<typeof mock<HistoryReplaceState>>;

const originalLocation = window.location;
const originalReplaceState = window.history.replaceState;

function createReplaceStateSpy(): HistoryReplaceStateMock {
  return mock<HistoryReplaceState>(function replaceState() {});
}

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

  test("writes repeated query params through history.replaceState", () => {
    const replaceStateSpy = createReplaceStateSpy();

    Object.defineProperty(window, "location", {
      value: { href: "http://localhost/" },
      writable: true,
    });
    window.history.replaceState = replaceStateSpy as HistoryReplaceState;

    render(h(TestComponent, {}));

    fireEvent.click(screen.getByText("Set"));
    expect(String(replaceStateSpy.mock.calls.at(-1)?.[2] ?? "")).toContain("treeCollapsed=%2Ftmp%2Fdev");

    fireEvent.click(screen.getByText("Clear"));
    expect(String(replaceStateSpy.mock.calls.at(-1)?.[2] ?? "")).not.toContain("treeCollapsed=");
  });
});
