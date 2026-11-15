import { act, fireEvent, render, screen, setupUITests } from "../../testing/ui-setup";

import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { Settings } from "../templates/Settings";
import { invalidateFetches } from "../invalidateFetches";
import { fixture_projectConfig } from "./fixtures";

setupUITests();
const originalFetch = globalThis.fetch;
const clipboardDescriptors = Object.fromEntries(
  Object.entries(Object.getOwnPropertyDescriptors(navigator)).filter(([key]) => key === "clipboard"),
);
afterEach(() => {
  globalThis.fetch = originalFetch;
  Reflect.deleteProperty(navigator, "clipboard");
  Object.defineProperties(navigator, clipboardDescriptors);
});

describe("Settings request states", () => {
  test("reports a configuration error without inventing unconfigured paths and retries", async () => {
    const fetchMock = spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Offline"));
    render(<Settings />);
    expect(screen.getByRole("status").textContent).toBe("Loading project configuration…");
    await screen.findByRole("alert");
    expect(screen.queryByText("Not configured")).toBeNull();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: fixture_projectConfig })));
    fireEvent.click(screen.getByRole("button", { name: "Retry project configuration" }));
    await screen.findByText("/project");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("retains paths and labels stale data after a failed refresh", async () => {
    const fetchMock = spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: fixture_projectConfig })),
    );
    render(<Settings />);
    await screen.findByText("/project");
    fetchMock.mockRejectedValueOnce(new Error("Offline"));
    act(() => invalidateFetches("/config"));
    await screen.findByText("Showing previously loaded data. It may be out of date.");
    expect(screen.getByText("/project")).toBeInTheDocument();
  });

  test("explains the read-only workflow and copies each tool root independently", async () => {
    const secondRoot = `/project/${"long-directory/".repeat(12)}tools`;
    spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: { ...fixture_projectConfig, toolConfigsDir: ["/project/tools", secondRoot] },
        }),
      ),
    );
    const write = mock(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: write } });
    render(<Settings />);
    await screen.findByRole("heading", { name: "Project configuration" });
    expect(screen.getByText(/Read-only\./).textContent).toBe(
      "Read-only. These paths come from the configuration loaded when this dashboard started. Edit that configuration in your preferred editor, then restart the dashboard to load changes.",
    );
    expect(screen.getByText("/project/tools")).toBeInTheDocument();
    expect(screen.getByText(secondRoot)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Copy tool configuration directory 2" }));
    await screen.findByText("Copied to clipboard.");
    expect(write).toHaveBeenCalledWith(secondRoot);
    expect(write).toHaveBeenCalledTimes(1);
  });

  test.each([{ toolConfigsDir: [] }, { toolConfigsDir: "" }])(
    "does not offer to copy missing paths or invent a tool root (%p)",
    async ({ toolConfigsDir }) => {
      spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, data: { ...fixture_projectConfig, binariesDir: "", toolConfigsDir } }),
        ),
      );
      render(<Settings />);
      await screen.findByText("None configured");
      expect(screen.getByText("Not configured")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Copy binaries directory" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Copy tool configuration directory 1" })).toBeNull();
    },
  );
});
