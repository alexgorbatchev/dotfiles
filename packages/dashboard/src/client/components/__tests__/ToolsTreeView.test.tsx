// UI test setup - registers DOM and exports testing utilities
import { fireEvent, render, screen, setupUITests } from "../../../testing/ui-setup";

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

setupUITests();

import type { IFileTreeEntry, IToolConfigsTree, IToolDetail } from "../../../shared/types";
import { ToolsTreeView } from "../ToolsTreeView";

function createTool(name: string, status: "installed" | "not-installed" | "error" = "installed"): IToolDetail {
  return {
    config: {
      name,
      version: "1.0.0",
      installationMethod: "github-release",
      installParams: {},
    },
    runtime: {
      status,
      installedVersion: status === "installed" ? "1.0.0" : null,
      installedAt: status === "installed" ? "2024-01-01" : null,
      installPath: status === "installed" ? "/path/to/tool" : null,
      binaryPaths: [],
      hasUpdate: false,
    },
    files: [],
    binaryDiskSize: 0,
    usage: {
      totalCount: 0,
      binaries: [],
    },
  };
}

function createTreeResponse(entries: IFileTreeEntry[]): IToolConfigsTree {
  return {
    rootPath: "/home/user/tools",
    entries,
  };
}

// Store original fetch
const originalFetch = globalThis.fetch;

function mockFetchWith(treeData: IToolConfigsTree | null): void {
  const mockFn = mock(async (url: string) => {
    if (url.includes("/tool-configs-tree")) {
      return new Response(JSON.stringify({ success: true, data: treeData }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Not found", { status: 404 });
  });
  globalThis.fetch = Object.assign(mockFn, { preconnect: () => {} }) as typeof fetch;
}

describe("ToolsTreeView", () => {
  beforeEach(() => {
    // Reset fetch mock
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("renders loading state initially", () => {
    // Don't resolve fetch immediately
    const mockFn = mock(async () => new Promise(() => {}));
    globalThis.fetch = Object.assign(mockFn, { preconnect: () => {} }) as typeof fetch;
    render(<ToolsTreeView tools={[]} />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  test("renders empty state when no entries", async () => {
    mockFetchWith(createTreeResponse([]));
    render(<ToolsTreeView tools={[]} />);

    // Wait for async render
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByText("No tool files found")).toBeInTheDocument();
  });

  test("renders card with title", async () => {
    mockFetchWith(
      createTreeResponse([
        { name: "fzf.tool.ts", path: "/home/user/tools/fzf.tool.ts", type: "file", toolName: "fzf" },
      ]),
    );
    render(<ToolsTreeView tools={[createTool("fzf")]} />);

    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByText("Tool Files")).toBeInTheDocument();
  });

  test("renders tool file in tree", async () => {
    mockFetchWith(
      createTreeResponse([
        { name: "fzf.tool.ts", path: "/home/user/tools/fzf.tool.ts", type: "file", toolName: "fzf" },
      ]),
    );
    render(<ToolsTreeView tools={[createTool("fzf")]} />);

    await new Promise((r) => setTimeout(r, 10));
    // Text is split: base name + extension in separate spans
    expect(screen.getByText("fzf")).toBeInTheDocument();
    expect(screen.getByText(".tool.ts")).toBeInTheDocument();
  });

  test("renders nested folder structure", async () => {
    mockFetchWith(
      createTreeResponse([
        {
          name: "dev",
          path: "/home/user/tools/dev",
          type: "directory",
          children: [
            { name: "fzf.tool.ts", path: "/home/user/tools/dev/fzf.tool.ts", type: "file", toolName: "fzf" },
            { name: "bat.tool.ts", path: "/home/user/tools/dev/bat.tool.ts", type: "file", toolName: "bat" },
          ],
        },
      ]),
    );
    render(<ToolsTreeView tools={[createTool("fzf"), createTool("bat")]} />);

    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByText("dev")).toBeInTheDocument();
    expect(screen.getByText("fzf")).toBeInTheDocument();
    expect(screen.getByText("bat")).toBeInTheDocument();
  });

  test("renders multiple folders", async () => {
    mockFetchWith(
      createTreeResponse([
        {
          name: "dev",
          path: "/home/user/tools/dev",
          type: "directory",
          children: [{ name: "fzf.tool.ts", path: "/home/user/tools/dev/fzf.tool.ts", type: "file", toolName: "fzf" }],
        },
        {
          name: "infra",
          path: "/home/user/tools/infra",
          type: "directory",
          children: [
            { name: "docker.tool.ts", path: "/home/user/tools/infra/docker.tool.ts", type: "file", toolName: "docker" },
          ],
        },
      ]),
    );
    render(<ToolsTreeView tools={[createTool("fzf"), createTool("docker")]} />);

    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByText("dev")).toBeInTheDocument();
    expect(screen.getByText("infra")).toBeInTheDocument();
    expect(screen.getByText("fzf")).toBeInTheDocument();
    expect(screen.getByText("docker")).toBeInTheDocument();
  });

  test("navigates to tool detail on file click", async () => {
    const originalLocation = window.location.href;
    mockFetchWith(
      createTreeResponse([
        { name: "fzf.tool.ts", path: "/home/user/tools/fzf.tool.ts", type: "file", toolName: "fzf" },
      ]),
    );
    render(<ToolsTreeView tools={[createTool("fzf")]} />);

    await new Promise((r) => setTimeout(r, 10));

    // Mock window.location
    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
    });

    // Click on the base name (extension is in separate span)
    fireEvent.click(screen.getByText("fzf"));

    expect(window.location.href).toBe("/tools/fzf");

    // Restore
    Object.defineProperty(window, "location", {
      value: { href: originalLocation },
      writable: true,
    });
  });

  test("colors installed tool files green", async () => {
    mockFetchWith(
      createTreeResponse([
        { name: "fzf.tool.ts", path: "/home/user/tools/fzf.tool.ts", type: "file", toolName: "fzf" },
      ]),
    );
    const { container } = render(<ToolsTreeView tools={[createTool("fzf", "installed")]} />);

    await new Promise((r) => setTimeout(r, 10));
    const icon = container.querySelector("svg.lucide-file-code.text-green-400");
    expect(icon).toBeInTheDocument();
  });

  test("colors not-installed tool files blue", async () => {
    mockFetchWith(
      createTreeResponse([
        { name: "fzf.tool.ts", path: "/home/user/tools/fzf.tool.ts", type: "file", toolName: "fzf" },
      ]),
    );
    const { container } = render(<ToolsTreeView tools={[createTool("fzf", "not-installed")]} />);

    await new Promise((r) => setTimeout(r, 10));
    const icon = container.querySelector("svg.lucide-file-code.text-blue-400");
    expect(icon).toBeInTheDocument();
  });
});
