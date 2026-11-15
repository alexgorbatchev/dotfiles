import { fixture_health } from "./fixtures";
import { act, fireEvent, render, screen, setupUITests } from "../../testing/ui-setup";

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { JSX } from "preact";
import type { IToolConfigsTree, IToolDetail } from "../../shared/types";
import type { IUseToolActions } from "../hooks/useToolActions";
import { useInventoryQuery } from "../hooks/useInventoryQuery";
import { ToolsTreeView } from "../components/ToolsTreeView";
import { fixture_idleActions, fixture_tool } from "./fixtures";

setupUITests();
const originalFetch = globalThis.fetch;
const originalLocation = window.location;
const originalReplace = window.history.replaceState;
let location = new URL("http://localhost/");

const tools: IToolDetail[] = [
  { ...fixture_tool, config: { ...fixture_tool.config, name: "zeta", installationMethod: "cargo", binaries: ["za"] } },
  {
    ...fixture_tool,
    config: { name: "alpha shell/100%", installationMethod: "cargo", binaries: [{ name: "shell-helper" }] },
    runtime: { ...fixture_tool.runtime, status: "not-installed", installedVersion: null, binaryPaths: null },
  },
  {
    ...fixture_tool,
    config: { name: "broken" },
    runtime: { ...fixture_tool.runtime, status: "error", installedVersion: null, binaryPaths: null },
  },
];
const tree: IToolConfigsTree = {
  roots: [
    {
      label: "~/tools",
      path: "/home/test/tools",
      entries: [
        {
          name: "dev",
          path: "/home/test/tools/dev",
          type: "directory",
          children: [
            {
              name: "shell.tool.ts",
              path: "/home/test/tools/dev/shell.tool.ts",
              type: "file",
              toolName: "alpha shell/100%",
            },
          ],
        },
        { name: "broken.tool.ts", path: "/home/test/tools/broken.tool.ts", type: "file", toolName: "broken" },
      ],
    },
    {
      label: "~/work/tools",
      path: "/home/test/work/tools",
      entries: [{ name: "zeta.tool.ts", path: "/home/test/work/tools/zeta.tool.ts", type: "file", toolName: "zeta" }],
    },
  ],
};

type InventoryHarnessProps = { records?: IToolDetail[]; actions?: IUseToolActions };

function InventoryHarness({ records = tools, actions = fixture_idleActions }: InventoryHarnessProps): JSX.Element {
  const inventory = useInventoryQuery();
  return <ToolsTreeView tools={records} actions={actions} inventory={inventory} />;
}

function mockTree(data: unknown): void {
  const responses: Record<string, unknown> = { "/api/health": fixture_health, "/api/tool-configs-tree": data };
  globalThis.fetch = Object.assign(
    mock(async (input: Parameters<typeof fetch>[0]) => {
      return new Response(JSON.stringify({ success: true, data: responses[String(input)] }));
    }),
    { preconnect: () => {} },
  ) as typeof fetch;
}

beforeEach(() => {
  location = new URL("http://localhost/");
  Object.defineProperty(window, "location", { value: location, writable: true });
  window.history.replaceState = (_data, _unused, url) => {
    location.href = new URL(String(url), location).href;
  };
  mockTree(tree);
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  Object.defineProperty(window, "location", { value: originalLocation, writable: true });
  window.history.replaceState = originalReplace;
});

describe("Tool inventory", () => {
  test("shows every configured tool while sources load, then names, textual state and readable source metadata", async () => {
    render(<InventoryHarness />);
    expect(screen.getByRole("link", { name: "View alpha shell/100%" })).toBeInTheDocument();
    expect(screen.getByText("Loading tool sources…")).toBeInTheDocument();
    expect(await screen.findByText("dev/shell.tool.ts")).toBeInTheDocument();
    const sourceSummary = screen.getByText("dev/shell.tool.ts").closest("summary");
    expect(sourceSummary).toHaveTextContent("~/tools / dev/shell.tool.ts");
    const sourceDetails = sourceSummary?.closest("details");
    expect(sourceDetails).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("dev/shell.tool.ts"));
    expect(sourceDetails).toHaveAttribute("open");
    expect(screen.getByText("/home/test/tools/dev/shell.tool.ts")).toBeVisible();
    expect(screen.getByRole("option", { name: "~/work/tools" })).toBeInTheDocument();
    expect(screen.getByText("Version 1")).toBeInTheDocument();
    expect(screen.getByText("Binaries: shell-helper")).toBeInTheDocument();
    expect(screen.getAllByText("Installation error").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not installed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Method not declared").length).toBeGreaterThan(0);
    expect(screen.getByText("3 of 3 tools")).toBeInTheDocument();
  });

  test("composes binary search, installation, method and root filters and restores the full inventory", async () => {
    render(<InventoryHarness />);
    await screen.findByText("dev/shell.tool.ts");
    fireEvent.input(screen.getByRole("searchbox", { name: "Search tools" }), { target: { value: "HELPER" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Installation" }), { target: { value: "not-installed" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Method" }), { target: { value: "cargo" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Config root" }), { target: { value: "/home/test/tools" } });
    expect(screen.getByText("1 of 3 tools")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View zeta" })).toBeNull();
    const href = screen.getByRole("link", { name: "View alpha shell/100%" }).getAttribute("href");
    expect(href).toBe(
      `/tools/alpha%20shell%2F100%25?returnTo=${encodeURIComponent("/?q=HELPER&status=not-installed&method=cargo&root=%2Fhome%2Ftest%2Ftools")}`,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Installation" }), { target: { value: "installed" } });
    expect(screen.getByText("0 of 3 tools")).toBeInTheDocument();
    expect(screen.getByText("No tools match these filters. Try another search or reset filters.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.getByText("3 of 3 tools")).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(location.search).toBe("");
    expect(screen.queryByRole("button", { name: "Reset filters" })).toBeNull();
  });

  test("sorts names and responds to browser history without resetting unrelated URL state", async () => {
    location.href = "http://localhost/?keep=yes&sort=name-desc#tool-files";
    render(<InventoryHarness />);
    await screen.findByText("dev/shell.tool.ts");
    expect(screen.getAllByRole("link", { name: /^View / }).map((link) => link.textContent)).toEqual([
      "zeta",
      "broken",
      "alpha shell/100%",
    ]);
    fireEvent.change(screen.getByRole("combobox", { name: "Sort" }), { target: { value: "method" } });
    expect(location.search).toBe("?keep=yes&sort=method");
    expect(location.hash).toBe("#tool-files");
    expect(screen.getAllByRole("link", { name: /^View / }).map((link) => link.textContent)).toEqual([
      "broken",
      "alpha shell/100%",
      "zeta",
    ]);
    act(() => {
      location.href = "http://localhost/?status=error&sort=status";
      window.dispatchEvent(new Event("popstate"));
    });
    expect(screen.getByRole("combobox", { name: "Installation" })).toHaveValue("error");
    expect(screen.getAllByRole("link", { name: /^View / }).map((link) => link.textContent)).toEqual(["broken"]);
  });

  test("keeps native links separate from operations and encodes return context", async () => {
    const installTool = mock(async () => {});
    render(
      <InventoryHarness
        records={[{ ...fixture_tool, config: { ...fixture_tool.config, name: "zeta" } }]}
        actions={{ ...fixture_idleActions, installTool }}
      />,
    );
    const link = screen.getByRole("link", { name: "View zeta" });
    expect(link).toHaveAttribute("href", "/tools/zeta?returnTo=%2F");
    expect(link.closest("button")).toBeNull();
    expect(fireEvent.click(link, { ctrlKey: true })).toBe(true);
    const reinstall = screen.getByRole("button", { name: "Force reinstall", hidden: true });
    expect(link).not.toContainElement(reinstall);
    fireEvent.click(reinstall);
    expect(installTool).toHaveBeenCalledWith("zeta", true);
    await screen.findByText("zeta.tool.ts");
  });

  test("source failure cannot erase inventory and retry restores metadata", async () => {
    mockTree(null);
    render(<InventoryHarness />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Tool sources could not be loaded.");
    expect(screen.getByText("3 of 3 tools")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /^View / })).toHaveLength(3);
    expect(screen.getByRole("combobox", { name: "Config root" })).toBeDisabled();
    mockTree(tree);
    fireEvent.click(screen.getByRole("button", { name: "Retry tool sources" }));
    expect(await screen.findByText("dev/shell.tool.ts")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("an active root filter cannot claim zero matches when sources fail", async () => {
    location.href = "http://localhost/?root=%2Fmissing";
    mockTree(null);
    render(<InventoryHarness />);
    await screen.findByRole("alert");
    expect(screen.getByText("Source locations required for root filtering")).toBeInTheDocument();
    expect(screen.queryByText("0 of 3 tools")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.getByText("3 of 3 tools")).toBeInTheDocument();
  });

  test("missing selected method and root stay visible instead of silently widening results", async () => {
    location.href = "http://localhost/?method=removed&root=%2Fremoved";
    render(<InventoryHarness />);
    await screen.findByRole("option", { name: "~/work/tools" });
    expect(screen.getByRole("option", { name: "removed (not in inventory)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "/removed (unavailable)" })).toBeInTheDocument();
    expect(screen.getByText("0 of 3 tools")).toBeInTheDocument();
  });

  test("valid empty source metadata does not hide a configured tool", async () => {
    mockTree({ roots: [] });
    render(<InventoryHarness records={[fixture_tool]} />);
    expect(await screen.findByText("Source location not returned")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View example" })).toBeInTheDocument();
  });

  test("an empty configuration has one truthful inventory empty state", async () => {
    mockTree({ roots: [] });
    render(<InventoryHarness records={[]} />);
    expect(screen.getByText("No tools configured")).toBeInTheDocument();
    expect(screen.getByText("0 of 0 tools")).toBeInTheDocument();
    await screen.findByRole("combobox", { name: "Config root" });
  });

  test("a labelled 180-tool synthetic catalog supports name search without truncation", async () => {
    const synthetic = Array.from({ length: 180 }, (_, index) => ({
      ...fixture_tool,
      config: { ...fixture_tool.config, name: `synthetic-${String(index).padStart(3, "0")}-long-tool-name` },
    }));
    mockTree({ roots: [] });
    render(<InventoryHarness records={synthetic} />);
    expect(screen.getByText("180 of 180 tools")).toBeInTheDocument();
    fireEvent.input(screen.getByRole("searchbox"), { target: { value: "synthetic-179" } });
    expect(screen.getByText("1 of 180 tools")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View synthetic-179-long-tool-name" })).toBeInTheDocument();
  });
});

test("recency sort preserves filter navigation and exposes recorded and missing activity", async () => {
  location.href = "http://localhost/?keep=yes&status=installed#tool-files";
  const records: IToolDetail[] = [
    {
      ...fixture_tool,
      config: { name: "recorded" },
      usage: { totalCount: 0, binaries: [{ binaryName: "recorded", count: 0, lastUsedAt: "2026-01-01T00:00:00Z" }] },
    },
    { ...fixture_tool, config: { name: "unobserved" } },
  ];
  const { container } = render(<InventoryHarness records={records} />);
  await screen.findByText("2 of 2 tools");
  fireEvent.change(screen.getByRole("combobox", { name: "Sort" }), { target: { value: "last-used" } });
  expect(location.search).toBe("?keep=yes&status=installed&sort=last-used");
  expect(location.hash).toBe("#tool-files");
  expect(screen.getAllByRole("link", { name: /^View / }).map((link) => link.textContent)).toEqual([
    "unobserved",
    "recorded",
  ]);
  expect(screen.getByText("No usage recorded")).toBeVisible();
  expect(screen.getByText(/No usage recorded comes first/)).toBeVisible();
  expect(container.querySelector('time[datetime="2026-01-01T00:00:00.000Z"]')).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View recorded" })).toHaveAttribute(
    "href",
    `/tools/recorded?returnTo=${encodeURIComponent("/?keep=yes&status=installed&sort=last-used")}`,
  );
});
