// UI test setup - registers DOM and exports testing utilities
import { fireEvent, render, screen, setupUITests } from "../../testing/ui-setup";

import assert from "node:assert";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

setupUITests();

import type { IFileTreeEntry, IToolConfigsTree, IToolDetail, ToolRuntimeStatus } from "../../shared/types";
import type { IUseToolActions } from "../hooks/useToolActions";
import { ToolsTreeView } from "../components/ToolsTreeView";

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
    roots: [{ label: "~/tools", path: "/home/user/tools", entries }],
  };
}

// The server omits roots that contain no tool files, so an empty tree carries no roots at all.
const EMPTY_TREE_RESPONSE: IToolConfigsTree = { roots: [] };

const noopActions: IUseToolActions = {
  pending: null,
  results: [],
  dismissResult: () => {},
  retryResult: async () => {},
  installTool: async () => {},
  updateTool: async () => {},
  checkTool: async () => {},
};

function renderTree(tools: IToolDetail[]): ReturnType<typeof render> {
  return render(<ToolsTreeView tools={tools} actions={noopActions} />);
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
    renderTree([]);

    expect(screen.getByText("Loading tool files…")).toBeInTheDocument();
  });

  test("renders empty state when no entries", async () => {
    mockFetchWith(EMPTY_TREE_RESPONSE);
    renderTree([]);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByText("No tool files found")).toBeInTheDocument();
  });

  test("titles the card with the contracted root path", async () => {
    mockFetchWith(
      createTreeResponse([
        { name: "fzf.tool.ts", path: "/home/user/tools/fzf.tool.ts", type: "file", toolName: "fzf" },
      ]),
    );
    renderTree([createTool("fzf")]);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByText("~/tools")).toBeInTheDocument();
  });

  test("renders one card per configured tool-configs root", async () => {
    mockFetchWith({
      roots: [
        {
          label: "~/tools",
          path: "/home/user/tools",
          entries: [{ name: "fzf.tool.ts", path: "/home/user/tools/fzf.tool.ts", type: "file", toolName: "fzf" }],
        },
        {
          label: "~/extra-tools",
          path: "/home/user/extra-tools",
          entries: [{ name: "jq.tool.ts", path: "/home/user/extra-tools/jq.tool.ts", type: "file", toolName: "jq" }],
        },
      ],
    });
    renderTree([createTool("fzf"), createTool("jq")]);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByText("~/tools")).toBeInTheDocument();
    expect(screen.getByText("~/extra-tools")).toBeInTheDocument();
    expect(screen.getByText("fzf")).toBeInTheDocument();
    expect(screen.getByText("jq")).toBeInTheDocument();
  });

  test("renders tool file in tree", async () => {
    mockFetchWith(
      createTreeResponse([
        { name: "fzf.tool.ts", path: "/home/user/tools/fzf.tool.ts", type: "file", toolName: "fzf" },
      ]),
    );
    renderTree([createTool("fzf")]);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByText("fzf")).toBeInTheDocument();
    expect(screen.getByText(".tool.ts")).toBeInTheDocument();
  });

  test("sorts tools alphabetically by tool name ignoring subfolders", async () => {
    mockFetchWith(
      createTreeResponse([
        { name: "z-tool.tool.ts", path: "/home/user/tools/z-tool.tool.ts", type: "file", toolName: "z-tool" },
        {
          name: "dev",
          path: "/home/user/tools/dev",
          type: "directory",
          children: [
            {
              name: "a-tool.tool.ts",
              path: "/home/user/tools/dev/a-tool.tool.ts",
              type: "file",
              toolName: "a-tool",
            },
            {
              name: "m-tool.tool.ts",
              path: "/home/user/tools/dev/m-tool.tool.ts",
              type: "file",
              toolName: "m-tool",
            },
          ],
        },
      ]),
    );
    renderTree([createTool("z-tool"), createTool("a-tool"), createTool("m-tool")]);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const aTool = screen.getByText("a-tool");
    const mTool = screen.getByText("m-tool");
    const zTool = screen.getByText("z-tool");

    expect(aTool).toBeInTheDocument();
    expect(mTool).toBeInTheDocument();
    expect(zTool).toBeInTheDocument();

    // Verify order in DOM
    expect(aTool.compareDocumentPosition(mTool) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(mTool.compareDocumentPosition(zTool) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test("flattens nested folders into rows prefixed with the directory path", async () => {
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
    renderTree([createTool("fzf"), createTool("bat")]);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByText("fzf")).toBeInTheDocument();
    expect(screen.getByText("bat")).toBeInTheDocument();
    expect(screen.getAllByText("dev/")).toHaveLength(2);
    // The folder itself is no longer a row of its own.
    expect(screen.queryByText("dev")).not.toBeInTheDocument();
  });

  test("dims the directory path prefix", async () => {
    mockFetchWith(
      createTreeResponse([
        {
          name: "dev",
          path: "/home/user/tools/dev",
          type: "directory",
          children: [{ name: "fzf.tool.ts", path: "/home/user/tools/dev/fzf.tool.ts", type: "file", toolName: "fzf" }],
        },
      ]),
    );
    renderTree([createTool("fzf")]);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByText("dev/")).toHaveClass("text-muted-foreground");
  });

  test("joins deeply nested directories into a single prefix", async () => {
    mockFetchWith(
      createTreeResponse([
        {
          name: "dev",
          path: "/home/user/tools/dev",
          type: "directory",
          children: [
            {
              name: "cli",
              path: "/home/user/tools/dev/cli",
              type: "directory",
              children: [
                { name: "fzf.tool.ts", path: "/home/user/tools/dev/cli/fzf.tool.ts", type: "file", toolName: "fzf" },
              ],
            },
          ],
        },
      ]),
    );
    renderTree([createTool("fzf")]);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByText("dev/cli/")).toBeInTheDocument();
    expect(screen.getByText("fzf")).toBeInTheDocument();
  });

  test("renders root-level files without a path prefix", async () => {
    mockFetchWith(
      createTreeResponse([
        { name: "fzf.tool.ts", path: "/home/user/tools/fzf.tool.ts", type: "file", toolName: "fzf" },
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
    renderTree([createTool("fzf"), createTool("docker")]);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByText("fzf")).toBeInTheDocument();
    expect(screen.getByText("docker")).toBeInTheDocument();
    expect(screen.getByText("infra/")).toBeInTheDocument();
    expect(screen.queryByText("/")).not.toBeInTheDocument();
  });

  test("uses a named native link and independent action buttons", async () => {
    mockFetchWith(
      createTreeResponse([
        { name: "fzf.tool.ts", path: "/home/user/tools/fzf.tool.ts", type: "file", toolName: "fzf with space" },
      ]),
    );
    const installTool = mock(async () => {});
    render(<ToolsTreeView tools={[createTool("fzf with space")]} actions={{ ...noopActions, installTool }} />);
    const link = await screen.findByRole("link", { name: "View fzf with space" });
    expect(link).toHaveAttribute("href", "/tools/fzf%20with%20space");
    expect(link.closest("button")).toBeNull();
    expect(fireEvent.click(link, { ctrlKey: true })).toBe(true);
    const reinstall = screen.getByRole("button", { name: "Re-install" });
    expect(link).not.toContainElement(reinstall);
    fireEvent.click(reinstall);
    expect(installTool).toHaveBeenCalledWith("fzf with space", true);
    expect(screen.getByText("Installed")).toBeInTheDocument();
    expect(screen.getByText("Version 1.0.0")).toBeInTheDocument();
  });

  test("colors installed tool files green", async () => {
    mockFetchWith(
      createTreeResponse([
        { name: "fzf.tool.ts", path: "/home/user/tools/fzf.tool.ts", type: "file", toolName: "fzf" },
      ]),
    );
    const { container } = renderTree([createTool("fzf", "installed")]);

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
    const { container } = renderTree([createTool("fzf", "not-installed")]);

    await new Promise((resolve) => setTimeout(resolve, 10));
    const icon = container.querySelector("svg.lucide-file-code.text-blue-400");
    assert(icon);
    expect(icon).toBeInTheDocument();
  });

  test("renders safely when tool installParams is undefined", async () => {
    mockFetchWith(
      createTreeResponse([
        { name: "fzf.tool.ts", path: "/home/user/tools/fzf.tool.ts", type: "file", toolName: "fzf" },
      ]),
    );
    const toolWithoutInstallParams: IToolDetail = {
      ...createTool("fzf", "installed"),
      config: {
        name: "fzf",
        version: "1.0.0",
        installationMethod: "manual",
        installParams: undefined,
      },
    };
    renderTree([toolWithoutInstallParams]);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByText("fzf")).toBeInTheDocument();
  });
  test("reports malformed tree data and retries instead of claiming the directory is empty", async () => {
    mockFetchWith(null);
    renderTree([]);
    expect(await screen.findByRole("alert")).toHaveTextContent("Tool files could not be loaded.");
    expect(screen.queryByText("No tool files found")).not.toBeInTheDocument();
    mockFetchWith(EMPTY_TREE_RESPONSE);
    fireEvent.click(screen.getByRole("button", { name: "Retry tool files" }));
    expect(await screen.findByText("No tool files found")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("states missing and failed installations in text", async () => {
    mockFetchWith(
      createTreeResponse([
        { name: "absent.tool.ts", path: "/tools/absent.tool.ts", type: "file", toolName: "absent" },
        { name: "broken.tool.ts", path: "/tools/broken.tool.ts", type: "file", toolName: "broken" },
      ]),
    );
    renderTree([createTool("absent", "not-installed"), createTool("broken", "error")]);
    expect(await screen.findByText("Not installed")).toBeInTheDocument();
    expect(screen.getByText("Installation error")).toBeInTheDocument();
  });
});
