import { act, fireEvent, render, screen, setupUITests, waitFor } from "../../testing/ui-setup";

import assert from "node:assert";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { render as renderPreact } from "preact";
import { App } from "../layouts/App";
import { fixture_emptyHistory, fixture_projectConfig, fixture_tool } from "./fixtures";

setupUITests();

function apiResponse(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }), { headers: { "Content-Type": "application/json" } });
}

type ResponseFactory = () => Promise<Response>;
type FetchInput = Parameters<typeof fetch>[0];

function mockDashboardApi(overrides: Record<string, ResponseFactory> = {}): void {
  const payloads: Record<string, unknown> = {
    "GET /api/config": { ...fixture_projectConfig, version: "2.6.2" },
    "GET /api/tools": [fixture_tool],
    "GET /api/tool-configs-tree": {
      roots: [
        {
          path: "/project/tools",
          label: "~/tools",
          entries: [
            { name: "example.tool.ts", path: "/project/tools/example.tool.ts", type: "file", toolName: "example" },
          ],
        },
      ],
    },
    "GET /api/recent-tools": { tools: [] },
    "GET /api/health": {
      overall: "healthy",
      lastCheck: "2026-11-14T12:00:00Z",
      checks: [{ name: "Registry Integrity", status: "pass", message: "Registry is healthy", details: [] }],
    },
    "GET /api/tools/example/history": fixture_emptyHistory,
    "GET /api/tools/example/source": { content: "defineTool('example')", filePath: "/project/tools/example.tool.ts" },
  };
  const request = mock(async (input: FetchInput, options?: RequestInit) => {
    const key = `${options?.method ?? "GET"} ${String(input)}`;
    assert(key in payloads || key in overrides, `Unexpected dashboard request: ${key}`);
    const respond = overrides[key] ?? (async () => apiResponse(payloads[key]));
    return respond();
  });
  globalThis.fetch = Object.assign(request, { preconnect: () => {} }) as typeof fetch;
}

const originalFetch = globalThis.fetch;
beforeEach(() => {
  window.location.href = "http://localhost/";
  mockDashboardApi();
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("App routing and persistent controls", () => {
  test("routes native navigation and search through the same application", async () => {
    render(<App />);
    expect(screen.getByRole("main", { name: "Dashboard content" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "View example" })).toHaveAttribute(
      "href",
      "/tools/example?returnTo=%2F",
    );
    fireEvent.click(screen.getByRole("link", { name: "⚙️ Settings" }));
    expect(await screen.findByText("Project Paths")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "⚙️ Settings" })).toHaveAttribute("aria-current", "page");
    const search = screen.getByRole("button", { name: /Search/ });
    search.focus();
    fireEvent.click(search);
    fireEvent.input(screen.getByRole("combobox"), { target: { value: "example" } });
    expect(await screen.findByRole("option")).toHaveTextContent("example");
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(await screen.findByRole("heading", { name: "example" })).toBeInTheDocument();
    expect(screen.getByTestId("CommandPalette")).not.toHaveAttribute("open");
    expect(document.activeElement).toBe(search);
    fireEvent.click(screen.getByRole("link", { name: "🏠 Home" }));
    expect(await screen.findByRole("link", { name: "View example" })).toBeInTheDocument();
  });

  test("keeps an operation and its result while navigating across route children", async () => {
    const install = Promise.withResolvers<Response>();
    mockDashboardApi({ "POST /api/tools/example/install": () => install.promise });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Re-install" }));
    expect(await screen.findByText("Reinstalling example. Waiting for the server.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "🏥 Health" }));
    expect(await screen.findByText("Registry is healthy")).toBeInTheDocument();
    expect(screen.getByText("Reinstalling example. Waiting for the server.")).toBeInTheDocument();
    await act(async () => {
      install.resolve(apiResponse({ installed: true, version: "2", alreadyInstalled: false }));
    });
    expect(await screen.findByText("Reinstalled 2")).toBeInTheDocument();
    expect(screen.queryByText("Reinstalling example. Waiting for the server.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "⚙️ Settings" }));
    expect(await screen.findByText("Project Paths")).toBeInTheDocument();
    expect(screen.getByText("Reinstalled 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("region", { name: "Tool operations" })).not.toBeInTheDocument();
  });

  test("unknown routes render a 404 with a native link back to the dashboard", async () => {
    window.location.href = "http://localhost/unknown-page";
    const { container } = render(<App />);
    expect(screen.getByRole("heading", { name: "404 - Not Found" })).toBeInTheDocument();
    const back = screen.getByRole("link", { name: "Go to Dashboard" });
    expect(back).toHaveAttribute("href", "/");
    expect(container.querySelector("button a")).toBeNull();
    fireEvent.click(back);
    expect(await screen.findByRole("link", { name: "View example" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "404 - Not Found" })).not.toBeInTheDocument();
  });
});

test("the dashboard entry hydrates #app and leaves no mounted application after cleanup", async () => {
  window.location.href = "http://localhost/unknown-page";
  const root = document.createElement("div");
  root.id = "app";
  document.body.append(root);
  try {
    await act(async () => {
      await import("../dashboard-client");
    });
    expect(screen.getByRole("main", { name: "Dashboard content" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "404 - Not Found" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Go to Dashboard" }));
    expect(await screen.findByRole("link", { name: "View example" })).toBeInTheDocument();
  } finally {
    await act(async () => {
      renderPreact(null, root);
    });
    root.remove();
  }
  await waitFor(() => expect(screen.queryByRole("main")).not.toBeInTheDocument());
});
