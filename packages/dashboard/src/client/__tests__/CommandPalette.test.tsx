import { fireEvent, render, screen, setupUITests, waitFor } from "../../testing/ui-setup";

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { type JSX } from "preact";
import { LocationProvider, useLocation } from "preact-iso";
import { useState } from "preact/hooks";
import { setupRerender, teardown } from "preact/test-utils";
import type { IToolDetail } from "../../shared/types";
import { CommandPalette } from "../components/CommandPalette";

setupUITests();

function tool(name: string, binaries?: IToolDetail["config"]["binaries"]): IToolDetail {
  return {
    config: { name, version: "latest", installationMethod: "github-release", binaries },
    runtime: { status: "not-installed", installedVersion: null, installedAt: null, installPath: null, binaryPaths: [] },
    files: [],
    binaryDiskSize: 0,
    usage: { totalCount: 0, binaries: [] },
  };
}

function CurrentRoute(): JSX.Element {
  const { url } = useLocation();
  return <output aria-label="Current route">{url}</output>;
}

function SearchHarness(): JSX.Element {
  const [isOpen, setOpen] = useState(false);
  return (
    <LocationProvider>
      <button onClick={() => setOpen(true)}>Launch search</button>
      <CommandPalette isOpen={isOpen} onOpenChange={setOpen} />
      <CurrentRoute />
    </LocationProvider>
  );
}

function respondWith(data: unknown): void {
  globalThis.fetch = Object.assign(
    mock(
      async () =>
        new Response(JSON.stringify({ success: true, data }), {
          headers: { "Content-Type": "application/json" },
        }),
    ),
    { preconnect: () => {} },
  ) as typeof fetch;
}

function openSearch(): HTMLElement {
  render(<SearchHarness />);
  const launcher = screen.getByRole("button", { name: "Launch search" });
  launcher.focus();
  fireEvent.click(launcher);
  return screen.getByRole("combobox", { name: "Search tools by name or binary" });
}

const originalFetch = globalThis.fetch;
beforeEach(() => {
  window.location.href = "http://localhost/";
  respondWith([]);
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("CommandPalette", () => {
  test("opens a named modal, focuses the search field and restores the launcher when closed", () => {
    const input = openSearch();
    expect(screen.getByRole("dialog", { name: "Search tools" })).toHaveAttribute("open");
    expect(document.activeElement).toBe(input);
    fireEvent.click(screen.getByRole("button", { name: "Close search" }));
    expect(screen.getByTestId("CommandPalette")).not.toHaveAttribute("open");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Launch search" }));
  });

  test("native Escape cancellation closes the modal and restores focus", () => {
    openSearch();
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(screen.getByTestId("CommandPalette")).not.toHaveAttribute("open");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Launch search" }));
  });

  test("reopens immediately after Escape before passive effects refresh the shortcut listener", () => {
    openSearch();
    const dialog = screen.getByRole("dialog");
    // Drain renders explicitly without flushing passive effects between native events.
    // fireEvent's act wrapper would refresh the listener and hide the stale-closure regression.
    const rerender = setupRerender();
    try {
      dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
      rerender();
      expect(dialog).not.toHaveAttribute("open");
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, cancelable: true }));
      rerender();
      expect(dialog.hasAttribute("open")).toBe(true);
      expect(document.activeElement).toBe(screen.getByRole("combobox"));
    } finally {
      teardown();
    }
  });

  test("supports Ctrl+K and Meta+K without a synthetic launcher key event", () => {
    render(<SearchHarness />);
    fireEvent.keyDown(document, { key: "K", ctrlKey: true });
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(screen.getByTestId("CommandPalette")).not.toHaveAttribute("open");
  });

  test("matches trimmed names and both supported binary representations", async () => {
    respondWith([tool("bat"), tool("ripgrep", ["rg"]), tool("find-utils", [{ name: "fd" }])]);
    const input = openSearch();
    fireEvent.input(input, { target: { value: "  BAT  " } });
    expect(await screen.findByRole("option", { name: /bat/ })).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-activedescendant", screen.getByRole("option").id);
    expect(input).toHaveAttribute("aria-controls", screen.getByRole("listbox").id);
    fireEvent.input(input, { target: { value: "rg" } });
    expect(screen.getByRole("option")).toHaveTextContent("ripgrep");
    expect(screen.getByRole("option")).toHaveTextContent("Binary: rg");
    fireEvent.input(input, { target: { value: "fd" } });
    expect(screen.getByRole("option")).toHaveTextContent("Binary: fd");
  });

  test("exposes all matches and scrolls the keyboard selection beyond the first ten", async () => {
    respondWith(Array.from({ length: 14 }, (_, index) => tool(`tool-${index + 1}`)));
    const scroll = spyOn(Element.prototype, "scrollIntoView");
    try {
      const input = openSearch();
      fireEvent.input(input, { target: { value: "tool" } });
      expect(await screen.findAllByRole("option")).toHaveLength(14);
      expect(screen.getByText("14 matches")).toBeInTheDocument();
      for (let index = 0; index < 13; index++) fireEvent.keyDown(input, { key: "ArrowDown" });
      const last = screen.getByRole("option", { selected: true });
      expect(last).toHaveTextContent("tool-14");
      expect(input).toHaveAttribute("aria-activedescendant", last.id);
      await waitFor(() => expect(scroll).toHaveBeenCalledWith({ block: "nearest" }));
      fireEvent.keyDown(input, { key: "Enter" });
      expect(screen.getByLabelText("Current route")).toHaveTextContent("/tools/tool-14");
      expect(screen.getByTestId("CommandPalette")).not.toHaveAttribute("open");
    } finally {
      scroll.mockRestore();
    }
  });

  test("keeps empty-result arrow presses safe and resets selection for a new query", async () => {
    respondWith([tool("tool one"), tool("tool two")]);
    const input = openSearch();
    fireEvent.input(input, { target: { value: "missing" } });
    expect(await screen.findByText("No tools found")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).not.toHaveAttribute("aria-activedescendant");
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
    fireEvent.input(input, { target: { value: "tool" } });
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent("tool one");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent("tool two");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent("tool one");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByLabelText("Current route")).toHaveTextContent("/tools/tool%20one");
  });

  test("keeps focus on the combobox for pointer selection", async () => {
    respondWith([tool("bat")]);
    const input = openSearch();
    fireEvent.input(input, { target: { value: "bat" } });
    const option = await screen.findByRole("option");
    expect(fireEvent.mouseDown(option)).toBe(false);
    expect(document.activeElement).toBe(input);
    fireEvent.mouseEnter(option);
    fireEvent.click(option);
    expect(screen.getByLabelText("Current route")).toHaveTextContent("/tools/bat");
  });

  test("clears the query when reopened and closes from the backdrop", async () => {
    respondWith([tool("bat")]);
    const input = openSearch();
    fireEvent.input(input, { target: { value: "bat" } });
    await screen.findByRole("option");
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.getByTestId("CommandPalette")).not.toHaveAttribute("open");
    fireEvent.click(screen.getByRole("button", { name: "Launch search" }));
    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  test("reports pending data without displaying a false no-results state", () => {
    globalThis.fetch = Object.assign(
      mock(() => new Promise<Response>(() => {})),
      { preconnect: () => {} },
    ) as typeof fetch;
    const input = openSearch();
    fireEvent.input(input, { target: { value: "bat" } });
    expect(screen.getByText("Loading tools…")).toHaveAttribute("role", "status");
    expect(screen.queryByText("No tools found")).not.toBeInTheDocument();
  });

  test("reports malformed data and retries the current query", async () => {
    respondWith(null);
    const input = openSearch();
    fireEvent.input(input, { target: { value: "bat" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Tools could not be loaded.");
    expect(screen.queryByText("No tools found")).not.toBeInTheDocument();
    respondWith([tool("bat")]);
    fireEvent.click(screen.getByRole("button", { name: "Retry tools" }));
    expect(await screen.findByRole("option")).toHaveTextContent("bat");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
