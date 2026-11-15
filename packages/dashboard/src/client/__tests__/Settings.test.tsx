import { act, fireEvent, render, screen, setupUITests } from "../../testing/ui-setup";

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { Settings } from "../templates/Settings";
import { invalidateFetches } from "../invalidateFetches";
import { fixture_projectConfig } from "./fixtures";

setupUITests();
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
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
});
