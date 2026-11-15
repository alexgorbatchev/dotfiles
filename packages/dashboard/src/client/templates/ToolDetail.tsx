import { type JSX } from "preact";
import { useMemo } from "preact/hooks";
import { File, History, Zap } from "../icons";

import type { IHealthStatus, ISerializableToolConfig, IToolDetail, IToolHistory } from "../../shared/types";
import { InstallMethodBadge } from "../components/InstallMethodBadge";
import { RequestStateNotice } from "../components/RequestStateNotice";
import { ToolHealth } from "../components/ToolHealth";
import { ToolActionButtons } from "../components/ToolActionButtons";
import { ReadmeCard } from "../components/ReadmeCard";
import { StatusBadge } from "../components/StatusBadge";
import { ToolHistory } from "../components/ToolHistory";
import { ToolDriftCard } from "../components/ToolDriftCard";
import { ToolSourceCard } from "../components/ToolSourceCard";
import { FileTree } from "../components/FileTree";
import { Button } from "../components/ui/Button";
import { TitledCard } from "../components/ui/TitledCard";
import { useFetch } from "../hooks/useFetch";
import { useRepeatedQueryParam } from "../hooks/useRepeatedQueryParam";
import { useSectionHash } from "../hooks/useSectionHash";
import { useToolActions } from "../hooks/useToolActions";
import { formatBytes } from "../utils/format";
import { inventoryReturnTo } from "../utils/inventoryReturnTo";
import { buildTreeForTool } from "../utils/tree";
import {
  buildBinaryToToolMap,
  findDependentTools,
  getBinaryName,
  getReadmeRepo,
  getSourceInfo,
} from "../utils/toolDetailUtils";

function getSourceDisplay(config: ISerializableToolConfig): JSX.Element | null {
  const sourceInfo = getSourceInfo(config);
  if (!sourceInfo) return null;

  return (
    <div class="flex min-w-0 flex-col gap-1">
      <span class="text-sm text-muted-foreground">Source</span>
      {sourceInfo.url ? (
        <a
          href={sourceInfo.url}
          target="_blank"
          rel="noopener noreferrer"
          class="text-sm text-blue-700 dark:text-blue-300 underline underline-offset-2 break-all"
        >
          {sourceInfo.value}
        </a>
      ) : (
        <span class="text-sm font-medium break-all">{sourceInfo.value}</span>
      )}
    </div>
  );
}

type ToolDetailProps = {
  params: {
    name: string;
  };
};

export function ToolDetail({ params }: ToolDetailProps): JSX.Element {
  const toolName = params.name;
  const returnTo = inventoryReturnTo(window.location.search);
  const sectionPath = `${window.location.pathname}${window.location.search}`;
  const {
    data: tools,
    loading: toolsLoading,
    error: toolsError,
    refetch: refetchTools,
  } = useFetch<IToolDetail[]>("/tools", [toolName]);
  const {
    data: history,
    loading: historyLoading,
    error: historyError,
    refetch: refetchHistory,
  } = useFetch<IToolHistory>(`/tools/${encodeURIComponent(toolName)}/history`, [toolName]);

  const health = useFetch<IHealthStatus>("/health", [toolName]);
  const actions = useToolActions();
  const latest = actions.results.findLast(
    (result) => result.outcome.toolName === toolName && result.outcome.latestVersion,
  )?.outcome;
  const [collapsedFileIds, setCollapsedFileIds] = useRepeatedQueryParam("filesCollapsed");

  const tool = tools?.find((t) => t.config.name === toolName) || null;

  const binaryToToolMap = useMemo(() => buildBinaryToToolMap(tools ?? []), [tools]);

  const currentToolBinaries = useMemo(() => (tool?.config.binaries ?? []).map(getBinaryName), [tool]);

  const dependentTools = useMemo(
    () => findDependentTools(tools ?? [], currentToolBinaries),
    [tools, currentToolBinaries],
  );
  const readmeRepo = tool ? getReadmeRepo(tool.config) : null;
  const hasTool = tool !== null;
  const installed = tool?.runtime.status === "installed";
  const hasDrift = (tool?.drift?.length ?? 0) > 0;
  const changedArtifacts = tool?.drift?.filter((item) => item.state !== "in-sync").length ?? 0;
  const sectionIds = useMemo(() => {
    if (!tool) return [];
    const ids = ["overview"];
    if (hasDrift) ids.push("drift");
    if (installed) ids.push("files", "history");
    ids.push("source");
    if (readmeRepo) ids.push("readme");
    return ids;
  }, [tool, hasDrift, installed, readmeRepo]);

  const { activeSection, revealSection } = useSectionHash(sectionIds, hasTool);

  function followSection(event: JSX.TargetedMouseEvent<HTMLAnchorElement>, id: string): void {
    if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      revealSection(id);
    }
  }

  if (!tool && (tools === null || toolsLoading || toolsError)) {
    return (
      <div data-testid="ToolDetail" class="space-y-4">
        <RequestStateNotice
          label="Tools"
          loading={toolsLoading}
          error={toolsError}
          hasData={tools !== null}
          onRetry={refetchTools}
        />
      </div>
    );
  }

  if (!tool) {
    return (
      <div data-testid="ToolDetail" class="text-center py-8">
        <div class="text-muted-foreground mb-4">Tool not found</div>
        <Button variant="link" asChild>
          <a href={returnTo}>← Back to results</a>
        </Button>
      </div>
    );
  }

  const fileRoots = buildTreeForTool(tool.files || []);

  return (
    <div data-testid="ToolDetail" class="space-y-4">
      <RequestStateNotice label="Tools" loading={toolsLoading} error={toolsError} hasData onRetry={refetchTools} />
      <a
        href={returnTo}
        class="inline-flex min-h-11 items-center rounded text-sm text-primary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring sm:min-h-6"
      >
        ← Back to results
      </a>
      <section id="overview" class="scroll-mt-4 space-y-3">
        <div class="flex flex-col items-start justify-between gap-3 md:flex-row">
          <div class="min-w-0 flex-1 space-y-2">
            <div class="flex min-w-0 flex-wrap items-center gap-3">
              <h1 class="min-w-0 break-words [overflow-wrap:anywhere] text-2xl font-bold">{tool.config.name}</h1>
              <StatusBadge status={tool.runtime.status} />
            </div>
            <div class="space-y-1">
              <ToolHealth tool={tool} health={health.data} stale={Boolean(health.error) || health.loading} />
              {health.data && (
                <p class="text-sm text-muted-foreground">
                  Health checked: {new Date(health.data.lastCheck).toLocaleString()}
                </p>
              )}
              <RequestStateNotice
                label="Installation health"
                loading={health.loading}
                error={health.error}
                hasData={health.data !== null}
                onRetry={health.refetch}
              />
            </div>
          </div>
          <ToolActionButtons
            toolName={toolName}
            isInstalled={tool.runtime.status === "installed"}
            metadata={tool.metadata}
            actions={actions}
            size="sm"
          />
        </div>

        <nav aria-label="Tool sections" class="flex flex-wrap gap-x-2 gap-y-1 border-y py-2">
          {sectionIds.map((id) => (
            <a
              key={id}
              href={`${sectionPath}#${id}`}
              onClick={(event) => followSection(event, id)}
              aria-current={activeSection === id ? "location" : undefined}
              class="inline-flex min-h-11 items-center rounded px-2 text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring aria-[current=location]:bg-accent sm:min-h-8"
            >
              {id === "readme" ? "README" : id.charAt(0).toUpperCase() + id.slice(1)}
            </a>
          ))}
        </nav>
        {changedArtifacts > 0 && (
          <a
            href={`${sectionPath}#drift`}
            onClick={(event) => followSection(event, "drift")}
            class="inline-flex min-h-11 items-center rounded text-sm font-medium text-primary underline underline-offset-2 sm:min-h-6"
          >
            Review {changedArtifacts} changed declaration(s)
          </a>
        )}
        <h2 class="sr-only">Overview</h2>
        <div class="grid min-w-0 gap-3 rounded-lg border bg-card p-3 grid-cols-2 lg:grid-cols-3">
          <div class="flex min-w-0 flex-col gap-1">
            <span class="text-sm text-muted-foreground">Method</span>
            <InstallMethodBadge method={tool.config.installationMethod} ghCli={tool.config.installParams?.ghCli} />
          </div>
          {getSourceDisplay(tool.config)}
          <div class="flex min-w-0 flex-col gap-1">
            <span class="text-sm text-muted-foreground">Installed version</span>
            <span class="min-w-0 break-words [overflow-wrap:anywhere] font-medium">
              {tool.runtime.installedVersion ?? "Not installed"}
            </span>
          </div>
          <div class="flex min-w-0 flex-col gap-1">
            <span class="text-sm text-muted-foreground">Configured version</span>
            <span class="min-w-0 break-words [overflow-wrap:anywhere] font-medium">
              {tool.config.version ?? "Not specified"}
            </span>
          </div>
          <div class="flex min-w-0 flex-col gap-1">
            <span class="text-sm text-muted-foreground">Effective requested version</span>
            <span class="font-medium [overflow-wrap:anywhere]">
              {tool.metadata.kind === "installable" ? tool.metadata.requestedVersion : "No package to install"}
            </span>
          </div>
          <div class="flex min-w-0 flex-col gap-1">
            <span class="text-sm text-muted-foreground">Latest known version</span>
            <span class="font-medium [overflow-wrap:anywhere]">{latest?.latestVersion ?? "Not available"}</span>
            {latest?.checkedAt && (
              <span class="text-xs text-muted-foreground">Checked {new Date(latest.checkedAt).toLocaleString()}</span>
            )}
          </div>
          <div class="flex min-w-0 flex-col gap-1">
            <span class="text-sm text-muted-foreground">Installed</span>
            <span class="min-w-0 break-words [overflow-wrap:anywhere] font-medium">
              {tool.runtime.installedAt ? new Date(tool.runtime.installedAt).toLocaleDateString() : "Not installed"}
            </span>
          </div>
          {tool.binaryDiskSize > 0 && (
            <div class="flex min-w-0 flex-col gap-1">
              <span class="text-sm text-muted-foreground">Binary Size</span>
              <span class="min-w-0 break-words [overflow-wrap:anywhere] font-medium">
                {formatBytes(tool.binaryDiskSize)}
              </span>
            </div>
          )}
          {tool.config.hostname && (
            <div class="flex min-w-0 flex-col gap-1">
              <span class="text-sm text-muted-foreground">Hostname</span>
              <code class="min-w-0 break-all text-sm font-mono bg-muted px-1.5 py-0.5 rounded">
                {tool.config.hostname}
              </code>
            </div>
          )}
          {tool.config.dependencies && tool.config.dependencies.length > 0 && (
            <div class="flex min-w-0 flex-col gap-1">
              <span class="text-sm text-muted-foreground">Depends on</span>
              <div class="flex min-w-0 flex-wrap gap-2 [overflow-wrap:anywhere]">
                {tool.config.dependencies.map((binaryName, i) => {
                  const linkedToolName = binaryToToolMap.get(binaryName);
                  return (
                    <a
                      key={i}
                      href={`/tools/${encodeURIComponent(linkedToolName ?? binaryName)}${returnTo === "/" ? "" : `?returnTo=${encodeURIComponent(returnTo)}`}`}
                      class="text-sm text-blue-700 dark:text-blue-300 underline underline-offset-2"
                    >
                      {linkedToolName ?? binaryName}
                    </a>
                  );
                })}
              </div>
            </div>
          )}
          {dependentTools.length > 0 && (
            <div class="flex min-w-0 flex-col gap-1">
              <span class="text-sm text-muted-foreground">Required by</span>
              <div class="flex min-w-0 flex-wrap gap-2 [overflow-wrap:anywhere]">
                {dependentTools.map((depTool, i) => (
                  <a
                    key={i}
                    href={`/tools/${encodeURIComponent(depTool.config.name)}${returnTo === "/" ? "" : `?returnTo=${encodeURIComponent(returnTo)}`}`}
                    class="text-sm text-blue-700 dark:text-blue-300 underline underline-offset-2"
                  >
                    {depTool.config.name}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
        {tool.usage.totalCount > 0 && (
          <details>
            <summary class="min-h-11 cursor-pointer content-center rounded py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring sm:min-h-6">
              Usage · {tool.usage.totalCount.toLocaleString()} runs
            </summary>
            <TitledCard title="Usage" icon={<Zap class="h-4 w-4" />}>
              <div class="space-y-3">
                <div class="flex min-w-0 flex-col gap-1">
                  <span class="text-sm text-muted-foreground">Total Runs</span>
                  <span class="min-w-0 break-words [overflow-wrap:anywhere] font-medium">
                    {tool.usage.totalCount.toLocaleString()}
                  </span>
                </div>
                <div class="space-y-2">
                  {tool.usage.binaries.map((entry) => (
                    <div key={entry.binaryName} class="rounded-md border border-border p-2">
                      <div class="flex items-center justify-between gap-2">
                        <code class="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{entry.binaryName}</code>
                        <span class="text-sm font-medium">{entry.count.toLocaleString()} runs</span>
                      </div>
                      {entry.lastUsedAt && (
                        <div class="mt-1 text-xs text-muted-foreground">
                          Last used {new Date(entry.lastUsedAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </TitledCard>
          </details>
        )}
      </section>

      {(tool.drift?.length || 0) > 0 && (
        <section id="drift">
          <ToolDriftCard driftItems={tool.drift} />
        </section>
      )}

      {tool.runtime.status === "installed" && (
        <section id="files">
          <TitledCard title="Files" icon={<File class="h-4 w-4" />}>
            {(tool.files?.length || 0) > 0 ? (
              <FileTree
                nodes={fileRoots}
                collapsedIds={collapsedFileIds}
                onItemToggle={(item, nextExpanded) => {
                  setCollapsedFileIds((previousIds) => {
                    const nextIds = new Set(previousIds);

                    if (nextExpanded) {
                      nextIds.delete(item.id);
                    } else {
                      nextIds.add(item.id);
                    }

                    return nextIds;
                  });
                }}
              />
            ) : (
              <div class="text-muted-foreground text-center py-4">No files tracked</div>
            )}
          </TitledCard>
        </section>
      )}

      {tool.runtime.status === "installed" && (
        <section id="history">
          <TitledCard title="History" icon={<History class="h-4 w-4" />}>
            <RequestStateNotice
              label="History"
              loading={historyLoading}
              error={historyError}
              hasData={history !== null}
              onRetry={refetchHistory}
            />
            {history && (
              <ToolHistory
                entries={history.entries}
                installedAt={history.installedAt}
                dotfilesDir={history.dotfilesDir}
              />
            )}
          </TitledCard>
        </section>
      )}

      <details key={`${toolName}:source`} id="source" class="scroll-mt-4 rounded-lg border bg-card">
        <summary class="min-h-11 cursor-pointer rounded p-3 font-semibold focus-visible:outline-2 focus-visible:outline-ring">
          Source
        </summary>
        <ToolSourceCard toolName={tool.config.name} />
      </details>

      {readmeRepo && (
        <details key={`${toolName}:readme`} id="readme" class="scroll-mt-4 rounded-lg border bg-card">
          <summary class="min-h-11 cursor-pointer rounded p-3 font-semibold focus-visible:outline-2 focus-visible:outline-ring">
            README
          </summary>
          <ReadmeCard toolName={tool.config.name} repo={readmeRepo} />
        </details>
      )}
    </div>
  );
}
