import type { IFileTreeEntry, IToolConfigsTree, IToolDetail } from "../../shared/types";
import type { IInventoryQuery, IInventoryRow, IInventorySource } from "../inventory/types";

export function readInventoryQuery(search: string): IInventoryQuery {
  const params = new URLSearchParams(search);
  const status = params.get("status") ?? "";
  const sort = params.get("sort") ?? "name";
  return {
    q: params.get("q") ?? "",
    status: ["installed", "not-installed", "error"].includes(status) ? status : "",
    method: params.get("method") ?? "",
    root: params.get("root") ?? "",
    sort: ["name", "name-desc", "status", "method"].includes(sort) ? sort : "name",
  };
}

export function writeInventoryQuery(search: string, query: IInventoryQuery): string {
  const params = new URLSearchParams(search);
  for (const [key, value] of Object.entries(query)) {
    params.delete(key);
    if (value && !(key === "sort" && value === "name")) params.set(key, value);
  }
  const result = params.toString();
  return result ? `?${result}` : "";
}

export function inventoryToolHref(name: string, returnTo?: string): string {
  const path = `/tools/${encodeURIComponent(name)}`;
  return returnTo ? `${path}?returnTo=${encodeURIComponent(returnTo)}` : path;
}

export function buildInventoryRows(tools: IToolDetail[], tree: IToolConfigsTree | null): IInventoryRow[] {
  const sourcesByName = new Map<string, IInventorySource[]>();
  for (const root of tree?.roots ?? []) {
    const collect = (entries: IFileTreeEntry[], prefix: string): void => {
      for (const entry of entries) {
        if (entry.type === "directory") {
          collect(entry.children ?? [], `${prefix}${entry.name}/`);
        } else if (entry.toolName) {
          const sources = sourcesByName.get(entry.toolName) ?? [];
          sources.push({
            rootPath: root.path,
            rootLabel: root.label,
            relativePath: `${prefix}${entry.name}`,
            path: entry.path,
          });
          sourcesByName.set(entry.toolName, sources);
        }
      }
    };
    collect(root.entries, "");
  }
  return tools.map((tool) => ({
    tool,
    binaries: [
      ...new Set([
        ...(tool.config.binaries ?? []).map((binary) => (typeof binary === "string" ? binary : binary.name)),
        ...(tool.runtime.binaryPaths ?? []).map((path) => path.split(/[\\/]/).at(-1) ?? path),
        ...tool.usage.binaries.map((binary) => binary.binaryName),
      ]),
    ].sort(),
    sources: sourcesByName.get(tool.config.name) ?? [],
  }));
}

export function filterInventoryRows(rows: IInventoryRow[], query: IInventoryQuery): IInventoryRow[] {
  const search = query.q.trim().toLocaleLowerCase();
  return rows
    .filter(
      ({ tool, binaries, sources }) =>
        (!search || [tool.config.name, ...binaries].some((name) => name.toLocaleLowerCase().includes(search))) &&
        (!query.status || tool.runtime.status === query.status) &&
        (!query.method || (tool.config.installationMethod ?? "undeclared") === query.method) &&
        (!query.root || sources.some((source) => source.rootPath === query.root)),
    )
    .toSorted((left, right) => {
      const name = left.tool.config.name.localeCompare(right.tool.config.name);
      if (query.sort === "name-desc") return -name;
      if (query.sort === "status") return left.tool.runtime.status.localeCompare(right.tool.runtime.status) || name;
      if (query.sort === "method")
        return (
          (left.tool.config.installationMethod ?? "").localeCompare(right.tool.config.installationMethod ?? "") || name
        );
      return name;
    });
}
