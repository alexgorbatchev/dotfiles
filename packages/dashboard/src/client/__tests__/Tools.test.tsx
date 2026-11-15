import { fireEvent, render, screen, setupUITests } from "../../testing/ui-setup";

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { ToolActionsProvider } from "../components/ToolActionsProvider";
import { fixture_tool } from "./fixtures";
import { Tools } from "../templates/Tools";

setupUITests();
const originalFetch = globalThis.fetch;
const originalLocation = window.location;
const originalReplace = window.history.replaceState;
beforeEach(() => {
  const location = new URL("http://localhost/");
  Object.defineProperty(window, "location", { value: location, writable: true });
  window.history.replaceState = (_data, _unused, url) => {
    location.href = new URL(String(url), location).href;
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  Object.defineProperty(window, "location", { value: originalLocation, writable: true });
  window.history.replaceState = originalReplace;
});

describe("Tools request state", () => {
  test("initial failure cannot become an empty inventory and retry recovers", async () => {
    const responses: Record<string, unknown> = {
      "/api/tools": { success: true, data: [] },
      "/api/tool-configs-tree": { success: true, data: { roots: [] } },
      "/api/recent-tools": { success: true, data: { tools: [] } },
    };
    const request = mock(
      async (input: Parameters<typeof fetch>[0]) => new Response(JSON.stringify(responses[String(input)])),
    ).mockRejectedValueOnce(new Error("Backend unavailable"));
    globalThis.fetch = Object.assign(request, { preconnect: () => {} }) as typeof fetch;
    render(
      <ToolActionsProvider>
        <Tools />
      </ToolActionsProvider>,
    );
    expect(await screen.findByText("Tools could not be loaded.")).toBeTruthy();
    expect(screen.queryByText("No tools configured")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Tools" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry tools" }));
    expect(await screen.findByText("No tools configured")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Tools" })).toBeTruthy();
    expect(screen.queryByText("Tools could not be loaded.")).toBeNull();
    expect(screen.getAllByText("No usage recorded yet. Run a managed tool to start collecting activity.")).toHaveLength(
      1,
    );
    expect(screen.queryByText("Most Used")).toBeNull();
    const workspace = screen.getByRole("region", { name: "Tools workspace" });
    const activity = screen.getByText("Activity · recent additions and usage").closest("details");
    expect(activity).not.toHaveAttribute("open");
    expect(activity && workspace.compareDocumentPosition(activity) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test("malformed success does not render empty summaries", async () => {
    const request = mock(async () => new Response(JSON.stringify({ success: true, data: {} })));
    globalThis.fetch = Object.assign(request, { preconnect: () => {} }) as typeof fetch;
    render(
      <ToolActionsProvider>
        <Tools />
      </ToolActionsProvider>,
    );
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("No tools configured")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Tools" })).toBeNull();
  });
  test("usage lists order recorded activity and exclude never-used tools", async () => {
    const ages = [10_000, 120_000, 7_200_000, 172_800_000, 5_184_000_000];
    const tools = ages.map((age, index) => ({
      ...fixture_tool,
      config: { ...fixture_tool.config, name: `used-${index}` },
      usage: {
        totalCount: index + 1,
        binaries: [
          { binaryName: "unknown-time", count: 0, lastUsedAt: null },
          { binaryName: "bad-time", count: 0, lastUsedAt: "invalid" },
          { binaryName: "example", count: index + 1, lastUsedAt: new Date(Date.now() - age).toISOString() },
        ],
      },
    }));
    const responses: Record<string, unknown> = {
      "/api/tools": [...tools, fixture_tool],
      "/api/recent-tools": { tools: [] },
      "/api/tool-configs-tree": { roots: [] },
    };
    globalThis.fetch = Object.assign(
      mock(
        async (input: Parameters<typeof fetch>[0]) =>
          new Response(JSON.stringify({ success: true, data: responses[String(input)] })),
      ),
      { preconnect: () => {} },
    ) as typeof fetch;
    render(
      <ToolActionsProvider>
        <Tools />
      </ToolActionsProvider>,
    );
    await screen.findByRole("heading", { name: "Tools" });
    fireEvent.click(screen.getByText("Activity · recent additions and usage"));
    expect(screen.getByText("Most Recently Used")).toBeTruthy();
    for (const label of ["just now", "2 minutes ago", "2 hours ago", "2 days ago", "2 months ago"])
      expect(screen.getByText(label)).toBeTruthy();
    const usageLinks = screen
      .getAllByRole("link")
      .filter((link) => link.textContent?.startsWith("used-") && !link.getAttribute("aria-label"));
    expect(usageLinks.slice(0, 5).map((link) => link.getAttribute("href"))).toEqual(
      ages.map((_, index) => `/tools/used-${index}?returnTo=%2F`),
    );
    expect(usageLinks.slice(5).map((link) => link.getAttribute("href"))).toEqual(
      ages.map((_, index) => `/tools/used-${4 - index}?returnTo=%2F`),
    );
    expect(usageLinks.some((link) => link.textContent?.includes("example"))).toBe(false);
  });
});
