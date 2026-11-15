import { type JSX } from "preact";
import { useMemo } from "preact/hooks";
import { File, History, Info, Zap } from "../icons";

import type { ISerializableToolConfig, IToolDetail, IToolHistory } from "../../shared/types";
import { InstallMethodBadge } from "../components/InstallMethodBadge";
import { RequestStateNotice } from "../components/RequestStateNotice";
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
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      <span class="w-24 shrink-0 text-sm text-muted-foreground">Source</span>
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

  const actions = useToolActions();
  const [collapsedFileIds, setCollapsedFileIds] = useRepeatedQueryParam("filesCollapsed");

  const tool = tools?.find((t) => t.config.name === toolName) || null;

  const binaryToToolMap = useMemo(() => buildBinaryToToolMap(tools ?? []), [tools]);

  const currentToolBinaries = useMemo(() => (tool?.config.binaries ?? []).map(getBinaryName), [tool]);

  const dependentTools = useMemo(
    () => findDependentTools(tools ?? [], currentToolBinaries),
    [tools, currentToolBinaries],
  );
  const readmeRepo = tool ? getReadmeRepo(tool.config) : null;
  const sectionIds = useMemo(() => {
    if (!tool) {
      return [];
    }

    const ids = ["overview", "source"];

    if (tool.runtime.status === "installed") {
      ids.push("files", "history");
    }

    if (readmeRepo) {
      ids.push("readme");
    }

    return ids;
  }, [readmeRepo, tool]);

  useSectionHash(sectionIds, tool !== null);

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
          <a href="/">← Back to Home</a>
        </Button>
      </div>
    );
  }

  const fileRoots = buildTreeForTool(tool.files || []);

  return (
    <div data-testid="ToolDetail" class="space-y-4">
      <RequestStateNotice label="Tools" loading={toolsLoading} error={toolsError} hasData onRetry={refetchTools} />
      <section id="overview" class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex min-w-0 flex-wrap items-center gap-3">
            <h1 class="min-w-0 break-words [overflow-wrap:anywhere] text-2xl font-bold">{tool.config.name}</h1>
            <StatusBadge status={tool.runtime.status} />
          </div>
          <ToolActionButtons
            toolName={toolName}
            isInstalled={tool.runtime.status === "installed"}
            actions={actions}
            size="sm"
          />
        </div>

        <div class={`grid gap-4 ${tool.usage.totalCount > 0 ? "lg:grid-cols-2" : ""}`}>
          <TitledCard title="Overview" icon={<Info class="h-4 w-4" />}>
            <div class="space-y-3">
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <span class="w-24 shrink-0 text-sm text-muted-foreground">Method</span>
                <InstallMethodBadge method={tool.config.installationMethod} ghCli={tool.config.installParams?.ghCli} />
              </div>
              {getSourceDisplay(tool.config)}
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <span class="w-24 shrink-0 text-sm text-muted-foreground">Version</span>
                <span class="min-w-0 break-words [overflow-wrap:anywhere] font-medium">
                  {tool.runtime.installedVersion || tool.config.version || "Unknown"}
                </span>
              </div>
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <span class="w-24 shrink-0 text-sm text-muted-foreground">Installed</span>
                <span class="min-w-0 break-words [overflow-wrap:anywhere] font-medium">
                  {tool.runtime.installedAt ? new Date(tool.runtime.installedAt).toLocaleDateString() : "Not installed"}
                </span>
              </div>
              {tool.binaryDiskSize > 0 && (
                <div class="flex min-w-0 flex-wrap items-center gap-2">
                  <span class="w-24 shrink-0 text-sm text-muted-foreground">Binary Size</span>
                  <span class="min-w-0 break-words [overflow-wrap:anywhere] font-medium">
                    {formatBytes(tool.binaryDiskSize)}
                  </span>
                </div>
              )}
              {tool.config.hostname && (
                <div class="flex min-w-0 flex-wrap items-center gap-2">
                  <span class="w-24 shrink-0 text-sm text-muted-foreground">Hostname</span>
                  <code class="min-w-0 break-all text-sm font-mono bg-muted px-1.5 py-0.5 rounded">
                    {tool.config.hostname}
                  </code>
                </div>
              )}
              {tool.config.dependencies && tool.config.dependencies.length > 0 && (
                <div class="flex items-start gap-2">
                  <span class="w-24 shrink-0 text-sm text-muted-foreground">Depends on</span>
                  <div class="flex min-w-0 flex-wrap gap-2 [overflow-wrap:anywhere]">
                    {tool.config.dependencies.map((binaryName, i) => {
                      const linkedToolName = binaryToToolMap.get(binaryName);
                      return (
                        <a
                          key={i}
                          href={`/tools/${encodeURIComponent(linkedToolName ?? binaryName)}`}
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
                <div class="flex items-start gap-2">
                  <span class="w-24 shrink-0 text-sm text-muted-foreground">Required by</span>
                  <div class="flex min-w-0 flex-wrap gap-2 [overflow-wrap:anywhere]">
                    {dependentTools.map((depTool, i) => (
                      <a
                        key={i}
                        href={`/tools/${encodeURIComponent(depTool.config.name)}`}
                        class="text-sm text-blue-700 dark:text-blue-300 underline underline-offset-2"
                      >
                        {depTool.config.name}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TitledCard>

          {tool.usage.totalCount > 0 && (
            <TitledCard title="Usage" icon={<Zap class="h-4 w-4" />}>
              <div class="space-y-3">
                <div class="flex min-w-0 flex-wrap items-center gap-2">
                  <span class="w-24 shrink-0 text-sm text-muted-foreground">Total Runs</span>
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
          )}
        </div>
      </section>

      <section id="source">
        <ToolSourceCard toolName={tool.config.name} />
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

      {readmeRepo && (
        <section id="readme">
          <ReadmeCard toolName={tool.config.name} repo={readmeRepo} />
        </section>
      )}
    </div>
  );
}
