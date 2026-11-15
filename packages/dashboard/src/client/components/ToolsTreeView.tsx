import { type JSX } from "preact";

import type { IHealthStatus, IToolConfigsTree, IToolDetail, ToolRuntimeStatus } from "../../shared/types";
import { useFetch } from "../hooks/useFetch";
import type { IInventoryQueryState } from "../hooks/useInventoryQuery";
import type { IUseToolActions } from "../hooks/useToolActions";
import { buildInventoryRows, filterInventoryRows, inventoryToolHref } from "../utils/inventoryUtils";
import { ToolHealth } from "./ToolHealth";
import { ToolActionButtons } from "./ToolActionButtons";
import { RequestStateNotice } from "./RequestStateNotice";
import { Button } from "./ui/Button";

type ToolsTreeViewProps = {
  tools: IToolDetail[];
  actions: IUseToolActions;
  inventory: IInventoryQueryState;
};

const statusLabels: Record<ToolRuntimeStatus, string> = {
  installed: "Installed",
  "not-installed": "Not installed",
  error: "Installation error",
};

export function ToolsTreeView({ tools, actions, inventory }: ToolsTreeViewProps): JSX.Element {
  const { data: tree, loading, error, refetch } = useFetch<IToolConfigsTree>("/tool-configs-tree");
  const health = useFetch<IHealthStatus>("/health");
  const findingCount = health.data?.checks.reduce((count, check) => count + check.findings.length, 0) ?? 0;
  const { query, updateQuery, resetQuery, returnTo } = inventory;
  const rows = filterInventoryRows(buildInventoryRows(tools, tree), query);
  const methods = [...new Set(tools.map((tool) => tool.config.installationMethod ?? "undeclared"))].sort();
  const roots = tree?.roots ?? [];
  const hasFilters = Boolean(query.q || query.status || query.method || query.root || query.sort !== "name");
  const isWaitingForSources = Boolean(query.root && tree === null);
  const controlClass =
    "min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";

  return (
    <div data-testid="ToolsTreeView" class="min-w-0 space-y-3">
      <div
        role="search"
        aria-label="Filter tools"
        class="grid min-w-0 grid-cols-2 items-end gap-2 lg:grid-cols-[minmax(12rem,1fr)_minmax(8rem,0.65fr)_minmax(8rem,0.65fr)_minmax(10rem,0.9fr)_minmax(8rem,0.6fr)]"
      >
        <label class="col-span-2 min-w-0 space-y-1 text-sm lg:col-span-1">
          <span>Search tools</span>
          <input
            type="search"
            value={query.q}
            placeholder="Name or binary"
            class={controlClass}
            onInput={(event) => updateQuery({ q: event.currentTarget.value })}
          />
        </label>
        <label class="min-w-0 space-y-1 text-sm">
          <span>Installation</span>
          <select
            value={query.status}
            class={controlClass}
            onChange={(event) => updateQuery({ status: event.currentTarget.value })}
          >
            <option value="">All states</option>
            <option value="installed">Installed</option>
            <option value="not-installed">Not installed</option>
            <option value="error">Installation error</option>
          </select>
        </label>
        <label class="min-w-0 space-y-1 text-sm">
          <span>Method</span>
          <select
            value={query.method}
            class={controlClass}
            onChange={(event) => updateQuery({ method: event.currentTarget.value })}
          >
            <option value="">All methods</option>
            {query.method && !methods.includes(query.method) && (
              <option value={query.method}>{query.method} (not in inventory)</option>
            )}
            {methods.map((method) => (
              <option key={method} value={method}>
                {method === "undeclared" ? "Method not declared" : method}
              </option>
            ))}
          </select>
        </label>
        <label class="min-w-0 space-y-1 text-sm">
          <span>Config root</span>
          <select
            value={query.root}
            disabled={tree === null}
            class={controlClass}
            onChange={(event) => updateQuery({ root: event.currentTarget.value })}
          >
            <option value="">All roots</option>
            {query.root && !roots.some((root) => root.path === query.root) && (
              <option value={query.root}>{query.root} (unavailable)</option>
            )}
            {roots.map((root) => (
              <option key={root.path} value={root.path}>
                {root.label}
              </option>
            ))}
          </select>
        </label>
        <label class="min-w-0 space-y-1 text-sm">
          <span>Sort</span>
          <select
            value={query.sort}
            class={controlClass}
            onChange={(event) => updateQuery({ sort: event.currentTarget.value })}
          >
            <option value="name">Name A–Z</option>
            <option value="name-desc">Name Z–A</option>
            <option value="status">Installation</option>
            <option value="method">Method</option>
          </select>
        </label>
      </div>
      <div class="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <p role="status" aria-live="polite" class="text-sm text-muted-foreground">
          {isWaitingForSources
            ? "Source locations required for root filtering"
            : `${rows.length} of ${tools.length} tools`}
        </p>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={resetQuery}>
            Reset filters
          </Button>
        )}
      </div>
      <RequestStateNotice
        label="Tool sources"
        loading={loading}
        error={error}
        hasData={tree !== null}
        onRetry={refetch}
      />
      <RequestStateNotice
        label="Installation health"
        loading={health.loading}
        error={health.error}
        hasData={health.data !== null}
        onRetry={health.refetch}
      />
      {health.data && (
        <p class="text-sm text-muted-foreground">
          Health checked: {new Date(health.data.lastCheck).toLocaleString()} · {findingCount}{" "}
          {findingCount === 1 ? "finding" : "findings"}.{" "}
          <a href="/health" class="underline">
            Review health
          </a>
        </p>
      )}
      {isWaitingForSources ? (
        <p class="py-3 text-sm text-muted-foreground">Load source locations or reset filters to see tools.</p>
      ) : rows.length === 0 ? (
        <p class="py-6 text-sm text-muted-foreground">
          {tools.length === 0
            ? "No tools configured"
            : "No tools match these filters. Try another search or reset filters."}
        </p>
      ) : (
        <ul aria-label="Tool inventory" class="divide-y rounded-lg border bg-card">
          {rows.map(({ tool, binaries, sources }) => (
            <li
              key={tool.config.name}
              class="flex min-w-0 flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between"
            >
              <div class="min-w-0 flex-1 space-y-1">
                <a
                  href={inventoryToolHref(tool.config.name, returnTo)}
                  aria-label={`View ${tool.config.name}`}
                  class="inline-flex min-h-11 min-w-0 max-w-full items-center rounded font-semibold [overflow-wrap:anywhere] hover:underline focus-visible:outline-2 focus-visible:outline-ring sm:min-h-6"
                >
                  {tool.config.name}
                </a>
                <div class="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  <span class={tool.runtime.status === "error" ? "font-medium text-destructive" : "font-medium"}>
                    {statusLabels[tool.runtime.status]}
                  </span>
                  {tool.runtime.status === "installed" && tool.runtime.installedVersion && (
                    <span class="text-muted-foreground">Version {tool.runtime.installedVersion}</span>
                  )}
                  <span class="text-muted-foreground">{tool.config.installationMethod ?? "Method not declared"}</span>
                  {binaries.length > 0 && (
                    <span class="min-w-0 text-muted-foreground [overflow-wrap:anywhere]">
                      Binaries: {binaries.join(", ")}
                    </span>
                  )}
                </div>
                <ToolHealth tool={tool} health={health.data} stale={Boolean(health.error) || health.loading} />
                {sources.map((source) => (
                  <details key={source.path} class="text-sm text-muted-foreground">
                    <summary class="min-h-11 cursor-pointer content-center rounded [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-ring sm:min-h-6">
                      <span>{source.rootLabel}</span>
                      <span aria-hidden="true"> / </span>
                      <span>{source.relativePath}</span>
                    </summary>
                    <p class="py-1 [overflow-wrap:anywhere]">{source.path}</p>
                  </details>
                ))}
                {sources.length === 0 && (
                  <p class="text-sm text-muted-foreground">
                    {tree === null ? "Source location unavailable" : "Source location not returned"}
                  </p>
                )}
              </div>
              <ToolActionButtons
                toolName={tool.config.name}
                isInstalled={tool.runtime.status === "installed"}
                metadata={tool.metadata}
                actions={actions}
                size="xs"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
