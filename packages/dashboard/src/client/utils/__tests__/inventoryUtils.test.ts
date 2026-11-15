import { describe, expect, test } from "bun:test";
import type { IToolConfigsTree, IToolDetail } from "../../../shared/types";
import { fixture_inventoryTool } from "./fixtures";
import {
  buildInventoryRows,
  filterInventoryRows,
  inventoryToolHref,
  readInventoryQuery,
  writeInventoryQuery,
} from "../inventoryUtils";

const tools: IToolDetail[] = [
  {
    ...fixture_inventoryTool,
    config: { name: "alpha", installationMethod: "manual", binaries: ["a", { name: "alias-a" }] },
    runtime: { ...fixture_inventoryTool.runtime, binaryPaths: ["/bin/a", "C:\\bin\\windows-a"] },
    usage: { totalCount: 1, binaries: [{ binaryName: "usage-a", count: 1, lastUsedAt: null }] },
  },
  {
    ...fixture_inventoryTool,
    config: { name: "beta", installationMethod: "cargo" },
    runtime: { ...fixture_inventoryTool.runtime, status: "not-installed", binaryPaths: null },
  },
  {
    ...fixture_inventoryTool,
    config: { name: "gamma", installationMethod: "cargo" },
    runtime: { ...fixture_inventoryTool.runtime, status: "installed", binaryPaths: null },
  },
  {
    ...fixture_inventoryTool,
    config: { name: "delta" },
    runtime: { ...fixture_inventoryTool.runtime, status: "error", binaryPaths: [] },
  },
];
const tree: IToolConfigsTree = {
  roots: [
    {
      label: "~/one",
      path: "/one",
      entries: [
        { name: "empty", path: "/one/empty", type: "directory" },
        { name: "readme", path: "/one/readme", type: "file" },
        {
          name: "dev",
          path: "/one/dev",
          type: "directory",
          children: [{ name: "alpha.tool.ts", path: "/one/dev/alpha.tool.ts", type: "file", toolName: "alpha" }],
        },
      ],
    },
    {
      label: "~/two",
      path: "/two",
      entries: [{ name: "alpha.tool.ts", path: "/two/alpha.tool.ts", type: "file", toolName: "alpha" }],
    },
  ],
};

describe("inventory transformations", () => {
  test("searches declared, installed and recorded binary names without duplicate aliases", () => {
    const rows = buildInventoryRows(tools, tree);
    expect(rows[0]?.binaries).toEqual(["a", "alias-a", "usage-a", "windows-a"]);
    for (const q of ["ALPHA", " alias-a ", "windows-a", "usage-a"]) {
      expect(filterInventoryRows(rows, { ...readInventoryQuery(""), q }).map((row) => row.tool.config.name)).toEqual([
        "alpha",
      ]);
    }
    expect(rows[0]?.sources.map((source) => source.relativePath)).toEqual(["dev/alpha.tool.ts", "alpha.tool.ts"]);
    expect(
      filterInventoryRows(rows, { ...readInventoryQuery(""), root: "/two" }).map((row) => row.tool.config.name),
    ).toEqual(["alpha"]);
  });

  test("combines status and method filters and sorts ties by name without changing input order", () => {
    const rows = buildInventoryRows(tools, null);
    const base = readInventoryQuery("");
    expect(
      filterInventoryRows(rows, { ...base, method: "cargo", status: "not-installed" }).map(
        (row) => row.tool.config.name,
      ),
    ).toEqual(["beta"]);
    expect(filterInventoryRows(rows, { ...base, method: "undeclared" }).map((row) => row.tool.config.name)).toEqual([
      "delta",
    ]);
    expect(filterInventoryRows(rows, { ...base, sort: "status" }).map((row) => row.tool.config.name)).toEqual([
      "delta",
      "alpha",
      "gamma",
      "beta",
    ]);
    expect(filterInventoryRows(rows, { ...base, sort: "method" }).map((row) => row.tool.config.name)).toEqual([
      "delta",
      "beta",
      "gamma",
      "alpha",
    ]);
    expect(filterInventoryRows(rows, { ...base, sort: "name-desc" }).map((row) => row.tool.config.name)).toEqual([
      "gamma",
      "delta",
      "beta",
      "alpha",
    ]);
    expect(filterInventoryRows(rows, base).map((row) => row.tool.config.name)).toEqual([
      "alpha",
      "beta",
      "delta",
      "gamma",
    ]);
    expect(rows.map((row) => row.tool.config.name)).toEqual(["alpha", "beta", "gamma", "delta"]);
  });

  test("round trips literal query values and normalizes unsupported states and duplicate URL keys", () => {
    const query = readInventoryQuery("?q=a%26b&q=ignored&root=%2Fa+b&method=manual&status=installed&sort=method");
    expect(query).toEqual({ q: "a&b", root: "/a b", method: "manual", status: "installed", sort: "method" });
    expect(readInventoryQuery(writeInventoryQuery("?keep=yes&q=stale&q=duplicate", query))).toEqual(query);
    expect(writeInventoryQuery("?keep=yes&q=stale", readInventoryQuery(""))).toBe("?keep=yes");
    expect(writeInventoryQuery("?q=stale&sort=method", readInventoryQuery(""))).toBe("");
    expect(readInventoryQuery("?status=unsupported&sort=unsupported")).toEqual(readInventoryQuery(""));
    expect(inventoryToolHref("percent/%25", "/?q=100%25&root=%2Fa")).toBe(
      "/tools/percent%2F%2525?returnTo=%2F%3Fq%3D100%2525%26root%3D%252Fa",
    );
    expect(inventoryToolHref("plain")).toBe("/tools/plain");
  });
});
