// UI test setup - registers DOM and exports testing utilities
import { fireEvent, render, screen, setupUITests } from "../../../testing/ui-setup";

import assert from "node:assert";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

setupUITests();

import type { IFileTreeEntry, IToolConfigsTree, IToolDetail, ToolRuntimeStatus } from "../../../shared/types";
import { ToolsTreeView } from "../ToolsTreeView";

const installedVersionByStatus: Record<ToolRuntimeStatus, string | null> = {
  installed: "1.0.0",
  "not-installed": null,
  error: null,
};

const installedAtByStatus: Record<ToolRuntimeStatus, string | null> = {
  installed: "2024-01-01",
  "not-installed": null,
  error: null,
};

const installPathByStatus: Record<ToolRuntimeStatus, string | null> = {
  installed: "/path/to/tool",
  "not-installed": null,
  error: null,
};

function createTool(name: string, status: ToolRuntimeStatus = "installed"): IToolDetail {
  return {
    config: {
      name,
      version: "1.0.0",
      installationMethod: "github-release",
      installParams: {},
    },
    runtime: {
      status,
      installedVersion: installedVersionByStatus[status],
      installedAt: installedAtByStatus[status],
      installPath: installPathByStatus[status],
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

const originalFetch = globalThis.fetch;

function mockFetchWith(treeData: IToolConfigsTree | null): void {
  const mockFn = mock(async () => {
    return new Response(JSON.stringify({ success: true, data: treeData }), {
      headers: { "Content-Type": "application/json" },
    });
  });
  globalThis.fetch = Object.assign(mockFn, { preconnect: () => {} }) as typeof fetch;
}

describe("ToolsTreeView", () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("renders loading state initially", () => {
    const mockFn = mock(async () => new Promise<Response>(() => {}));
    globalThis.fetch = Object.assign(mockFn, { preconnect: () => {} }) as typeof fetch;
    render(<ToolsTreeView tools={[]} />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  test("renders empty state when no entries", async () => {
    mockFetchWith(createTreeResponse([]));
    render(<ToolsTreeView tools={[]} />);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByText("No tool files found")).toBeInTheDocument();
  });

  test("renders card with title", async () => {
    mockFetchWith(
      createTreeResponse([
        { name: "fzf.tool.ts", path: "/home/user/tools/fzf.tool.ts", type: "file", toolName: "fzf" },
      ]),
    );
    render(<ToolsTreeView tools={[createTool("fzf")]} />);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByText("Tool Files")).toBeInTheDocument();
  });

  test("renders tool file in tree", async () => {
    mockFetchWith(
      createTreeResponse([
        { name: "fzf.tool.ts", path: "/home/user/tools/fzf.tool.ts", type: "file", toolName: "fzf" },
      ]),
    );
    render(<ToolsTreeView tools={[createTool("fzf")]} />);

    await new Promise((resolve) => setTimeout(resolve, 10));
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

    await new Promise((resolve) => setTimeout(resolve, 10));
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
            {
              name: "docker.tool.ts",
              path: "/home/user/tools/infra/docker.tool.ts",
              type: "file",
              toolName: "docker",
            },
          ],
        },
      ]),
    );
    render(<ToolsTreeView tools={[createTool("fzf"), createTool("docker")]} />);

    await new Promise((resolve) => setTimeout(resolve, 10));
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

    await new Promise((resolve) => setTimeout(resolve, 10));

    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
    });

    fireEvent.click(screen.getByText("fzf"));

    expect(window.location.href).toBe("/tools/fzf");

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

    await new Promise((resolve) => setTimeout(resolve, 10));
    const icon = container.querySelector("svg.lucide-file-code.text-green-400");
    assert(icon);
    expect(icon).toBeInTheDocument();
  });

  test("colors not-installed tool files blue", async () => {
    mockFetchWith(
      createTreeResponse([
        { name: "fzf.tool.ts", path: "/home/user/tools/fzf.tool.ts", type: "file", toolName: "fzf" },
      ]),
    );
    const { container } = render(<ToolsTreeView tools={[createTool("fzf", "not-installed")]} />);

    await new Promise((resolve) => setTimeout(resolve, 10));
    const icon = container.querySelector("svg.lucide-file-code.text-blue-400");
    assert(icon);
    expect(icon).toBeInTheDocument();
  });
});
