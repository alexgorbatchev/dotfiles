import { fireEvent, render, screen, setupUITests } from "../../testing/ui-setup";

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { ToolActionsProvider } from "../components/ToolActionsProvider";
import { fixture_tool, fixture_projectConfig, fixture_health } from "./fixtures";
import { invalidateFetches } from "../invalidateFetches";
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
      "/api/config": { success: true, data: fixture_projectConfig },
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
    expect(await screen.findByRole("heading", { name: "Add your first tool" })).toBeTruthy();
    await screen.findByRole("button", { name: "Copy starter command" });
    expect(screen.getByRole("heading", { name: "Tools" })).toBeTruthy();
    expect(screen.queryByText("Tools could not be loaded.")).toBeNull();
    expect(screen.queryByText("Most Used")).toBeNull();
    expect(screen.queryByText("Activity · recent additions and usage")).toBeNull();
    expect(screen.getByText("dotfiles --config '/project/dotfiles.config.ts' tool scaffold")).toBeInTheDocument();
    expect(screen.getByText("dotfiles --config '/project/dotfiles.config.ts' dashboard")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recheck after restart" })).toBeInTheDocument();
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
  test("recent usage follows timestamps, including zero-count observations, without count rankings", async () => {
    const ages = [10_000, 120_000, 7_200_000, 172_800_000, 5_184_000_000];
    const tools = ages.map((age, index) => ({
      ...fixture_tool,
      config: { ...fixture_tool.config, name: `used-${index}` },
      usage: {
        totalCount: index,
        binaries: [
          { binaryName: "unknown-time", count: 0, lastUsedAt: null },
          { binaryName: "bad-time", count: 0, lastUsedAt: "invalid" },
          { binaryName: "example", count: index, lastUsedAt: new Date(Date.now() - age).toISOString() },
        ],
      },
    }));
    const responses: Record<string, unknown> = {
      "/api/health": fixture_health,
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
      expect(screen.getAllByText(label)).not.toHaveLength(0);
    const usageLinks = screen
      .getAllByRole("link")
      .filter((link) => link.textContent?.startsWith("used-") && !link.getAttribute("aria-label"));
    expect(usageLinks.map((link) => link.getAttribute("href"))).toEqual(
      ages.map((_, index) => `/tools/used-${index}?returnTo=%2F`),
    );
    expect(screen.queryByText("Most Used")).toBeNull();
    expect(screen.queryByText(/\d+ runs/)).toBeNull();
    expect(usageLinks.some((link) => link.textContent?.includes("example"))).toBe(false);
  });
  test.each([
    { config: { ...fixture_projectConfig, configFilePath: "" }, expected: "Unknown — setup commands are unavailable." },
    {
      config: { ...fixture_projectConfig, toolConfigsDir: [] },
      expected: "None configured. Set paths.toolConfigsDir in your configuration, then restart the dashboard.",
    },
  ])("does not invent setup commands for incomplete project context: $expected", async ({ config, expected }) => {
    const responses: Record<string, unknown> = { "/api/tools": [], "/api/config": config };
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
    await screen.findByText(expected);
    expect(screen.queryByRole("button", { name: "Copy starter command" })).toBeNull();
  });

  test("uses shell-safe commands and rechecks without installing anything", async () => {
    const configPath = "/project's tools/$(never-run)/custom.config.ts";
    const responses: Record<string, unknown> = {
      "/api/tools": [],
      "/api/config": { ...fixture_projectConfig, configFilePath: configPath },
    };
    const response = mock(
      async (input: Parameters<typeof fetch>[0]) =>
        new Response(JSON.stringify({ success: true, data: responses[String(input)] })),
    );
    globalThis.fetch = Object.assign(response, { preconnect: () => {} }) as typeof fetch;
    render(
      <ToolActionsProvider>
        <Tools />
      </ToolActionsProvider>,
    );
    await screen.findByRole("button", { name: "Copy starter command" });
    expect(
      screen.getByText("dotfiles --config '/project'\\''s tools/$(never-run)/custom.config.ts' tool scaffold"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Recheck after restart" }));
    await screen.findByRole("heading", { name: "Add your first tool" });
    expect(
      response.mock.calls.map(([input]) => String(input)).every((url) => url === "/api/tools" || url === "/api/config"),
    ).toBe(true);
  });
});

type SetupResponse = () => Promise<Response>;

test("withholds setup commands when project context fails, then recovers without losing the empty inventory", async () => {
  const configRequest = mock(
    async () => new Response(JSON.stringify({ success: true, data: fixture_projectConfig })),
  ).mockRejectedValueOnce(new Error("Offline"));
  const responses: Record<string, SetupResponse> = {
    "/api/config": configRequest,
    "/api/tools": async () => new Response(JSON.stringify({ success: true, data: [] })),
  };
  globalThis.fetch = Object.assign(
    mock(async (input: Parameters<typeof fetch>[0]) => responses[String(input)]!()),
    { preconnect: () => {} },
  ) as typeof fetch;
  render(
    <ToolActionsProvider>
      <Tools />
    </ToolActionsProvider>,
  );
  await screen.findByText("Setup configuration could not be loaded.");
  expect(screen.queryByRole("button", { name: "Copy starter command" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry setup configuration" }));
  await screen.findByRole("button", { name: "Copy starter command" });
  configRequest.mockRejectedValueOnce(new Error("Still offline"));
  invalidateFetches("/config");
  await screen.findByText("Still offline");
  expect(screen.queryByRole("button", { name: "Copy starter command" })).toBeNull();
});
