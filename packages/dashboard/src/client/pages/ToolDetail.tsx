import { type JSX } from "preact";
import { useCallback, useMemo, useState } from "preact/hooks";
import { ArrowUpCircle, Download, File, History, Info, Layers, RefreshCw, Search, Zap } from "../icons";

import type {
  ICheckUpdateResponse,
  IInstallToolRequest,
  IInstallToolResponse,
  ISerializablePlatformConfigEntry,
  ISerializableToolConfig,
  IToolDetail,
  IToolHistory,
  IUpdateToolResponse,
} from "../../shared/types";
import { postApi } from "../api";
import { InstallMethodBadge } from "../components/InstallMethodBadge";
import { ReadmeCard } from "../components/ReadmeCard";
import { StatusBadge } from "../components/StatusBadge";
import { ToolHistory } from "../components/ToolHistory";
import { ToolSourceCard } from "../components/ToolSourceCard";
import { FileTree } from "../components/TreeNode";
import { Button } from "../components/ui/Button";
import { TitledCard } from "../components/ui/TitledCard";
import { useFetch } from "../hooks/useFetch";
import { formatBytes } from "../utils/format";
import { buildTreeForTool } from "../utils/tree";
import {
  buildBinaryToToolMap,
  findDependentTools,
  getBinaryName,
  getReadmeRepo,
  getSourceInfo,
} from "./tool-detail-utils";

function getSourceDisplay(config: ISerializableToolConfig): JSX.Element | null {
  const sourceInfo = getSourceInfo(config);
  if (!sourceInfo) return null;

  return (
    <div class="flex items-center gap-2">
      <span class="text-sm text-muted-foreground w-24">Source</span>
      {sourceInfo.url ? (
        <a
          href={sourceInfo.url}
          target="_blank"
          rel="noopener noreferrer"
          class="text-sm text-blue-500 hover:underline break-all"
        >
          {sourceInfo.value}
        </a>
      ) : (
        <span class="text-sm font-medium break-all">{sourceInfo.value}</span>
      )}
    </div>
  );
}

type PlatformConfigEntryProps = {
  entry: ISerializablePlatformConfigEntry;
};

function PlatformConfigEntry({ entry }: PlatformConfigEntryProps): JSX.Element {
  const platformLabel = entry.platforms.join(", ");
  const archLabel = entry.architectures ? ` (${entry.architectures.join(", ")})` : "";

  return (
    <div class="border border-border rounded-md p-3 space-y-2">
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-foreground">
          {platformLabel}
          {archLabel}
        </span>
      </div>
      <div class="pl-2 space-y-1.5 text-sm">
        {entry.installationMethod && (
          <div class="flex items-center gap-2">
            <span class="text-muted-foreground">Method:</span>
            <InstallMethodBadge method={entry.installationMethod} ghCli={entry.installParams?.ghCli} />
          </div>
        )}
        {entry.installParams?.repo && (
          <div class="flex items-center gap-2">
            <span class="text-muted-foreground">Repo:</span>
            <a
              href={`https://github.com/${entry.installParams.repo}`}
              target="_blank"
              rel="noopener noreferrer"
              class="text-blue-500 hover:underline"
            >
              {entry.installParams.repo}
            </a>
          </div>
        )}
        {entry.installParams?.formula && (
          <div class="flex items-center gap-2">
            <span class="text-muted-foreground">Formula:</span>
            <span class="font-mono">{entry.installParams.formula}</span>
          </div>
        )}
        {entry.installParams?.crate && (
          <div class="flex items-center gap-2">
            <span class="text-muted-foreground">Crate:</span>
            <span class="font-mono">{entry.installParams.crate}</span>
          </div>
        )}
        {entry.installParams?.url && (
          <div class="flex items-center gap-2">
            <span class="text-muted-foreground">URL:</span>
            <span class="font-mono text-xs break-all">{entry.installParams.url}</span>
          </div>
        )}
        {entry.binaries && entry.binaries.length > 0 && (
          <div class="flex items-start gap-2">
            <span class="text-muted-foreground">Binaries:</span>
            <span class="font-mono">{entry.binaries.map((b) => (typeof b === "string" ? b : b.name)).join(", ")}</span>
          </div>
        )}
        {entry.symlinks && entry.symlinks.length > 0 && (
          <div class="flex flex-col gap-1">
            <span class="text-muted-foreground">Symlinks:</span>
            <div class="pl-2">
              {entry.symlinks.map((s, i) => (
                <div key={i} class="font-mono text-xs">
                  {s.source} → {s.target}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type ToolDetailProps = {
  params: {
    name: string;
  };
};

export function ToolDetail({ params }: ToolDetailProps): JSX.Element {
  const toolName = decodeURIComponent(params.name);
  const { data: tools, loading: toolsLoading } = useFetch<IToolDetail[]>("/tools", [toolName]);
  const { data: history, loading: historyLoading } = useFetch<IToolHistory>(
    `/tools/${encodeURIComponent(toolName)}/history`,
    [toolName],
  );

  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installSuccess, setInstallSuccess] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [checkUpdateResult, setCheckUpdateResult] = useState<ICheckUpdateResponse | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<IUpdateToolResponse | null>(null);

  const tool = tools?.find((t) => t.config.name === toolName) || null;
  const loading = toolsLoading || historyLoading;

  const binaryToToolMap = useMemo(() => buildBinaryToToolMap(tools ?? []), [tools]);

  const currentToolBinaries = useMemo(() => (tool?.config.binaries ?? []).map(getBinaryName), [tool]);

  const dependentTools = useMemo(
    () => findDependentTools(tools ?? [], currentToolBinaries),
    [tools, currentToolBinaries],
  );

  const handleInstall = useCallback(
    async (force: boolean) => {
      setInstalling(true);
      setInstallError(null);
      setInstallSuccess(null);

      try {
        const result = await postApi<IInstallToolResponse, IInstallToolRequest>(
          `/tools/${encodeURIComponent(toolName)}/install`,
          { force },
        );

        if (result.installed) {
          const message = result.alreadyInstalled
            ? `Already installed (${result.version})`
            : `Installed ${result.version}`;
          setInstallSuccess(message);
          // Reload the page to refresh tool status
          setTimeout(() => window.location.reload(), 1500);
        } else {
          setInstallError(result.error ?? "Installation failed");
        }
      } catch (err) {
        setInstallError(err instanceof Error ? err.message : "Installation failed");
      } finally {
        setInstalling(false);
      }
    },
    [toolName],
  );

  const handleCheckUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    setCheckUpdateResult(null);

    try {
      const result = await postApi<ICheckUpdateResponse>(`/tools/${encodeURIComponent(toolName)}/check-update`, {});
      setCheckUpdateResult(result);
    } catch (err) {
      setCheckUpdateResult({
        hasUpdate: false,
        currentVersion: "unknown",
        latestVersion: "unknown",
        supported: false,
        error: err instanceof Error ? err.message : "Check failed",
      });
    } finally {
      setCheckingUpdate(false);
    }
  }, [toolName]);

  const handleUpdate = useCallback(async () => {
    setUpdating(true);
    setUpdateResult(null);

    try {
      const result = await postApi<IUpdateToolResponse>(`/tools/${encodeURIComponent(toolName)}/update`, {});
      setUpdateResult(result);
      if (result.updated) {
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (err) {
      setUpdateResult({
        updated: false,
        supported: false,
        error: err instanceof Error ? err.message : "Update failed",
      });
    } finally {
      setUpdating(false);
    }
  }, [toolName]);

  if (loading) {
    return (
      <div class="flex items-center justify-center h-64">
        <div class="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!tool) {
    return (
      <div class="text-center py-8">
        <div class="text-muted-foreground mb-4">Tool not found</div>
        <Button variant="link" asChild>
          <a href="/">← Back to Home</a>
        </Button>
      </div>
    );
  }

  const fileRoots = buildTreeForTool(tool.files || []);
  const readmeRepo = getReadmeRepo(tool.config);

  return (
    <div class="space-y-4">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <h1 class="text-2xl font-bold">{tool.config.name}</h1>
          <StatusBadge status={tool.runtime.status} />
        </div>
        <div class="flex items-center gap-2">
          {tool.runtime.status === "installed" ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckUpdate}
                disabled={checkingUpdate || installing || updating}
              >
                <Search class={`h-4 w-4 ${checkingUpdate ? "animate-spin" : ""}`} />
                {checkingUpdate ? "Checking..." : "Check for updates"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleUpdate}
                disabled={updating || installing || checkingUpdate}
              >
                <ArrowUpCircle class={`h-4 w-4 ${updating ? "animate-spin" : ""}`} />
                {updating ? "Updating..." : "Update"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleInstall(true)}
                disabled={installing || updating || checkingUpdate}
              >
                <RefreshCw class={`h-4 w-4 ${installing ? "animate-spin" : ""}`} />
                {installing ? "Installing..." : "Re-install"}
              </Button>
            </>
          ) : (
            <Button variant="default" size="sm" onClick={() => handleInstall(false)} disabled={installing}>
              <Download class="h-4 w-4" />
              {installing ? "Installing..." : "Install"}
            </Button>
          )}
        </div>
      </div>

      {/* Install status messages */}
      {installError && (
        <div class="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-2 rounded-md text-sm">
          {installError}
        </div>
      )}
      {installSuccess && (
        <div class="bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 px-4 py-2 rounded-md text-sm">
          {installSuccess}
        </div>
      )}

      {/* Check update status messages */}
      {checkUpdateResult && !checkUpdateResult.error && (
        <div
          class={`px-4 py-2 rounded-md text-sm ${
            checkUpdateResult.hasUpdate
              ? "bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 dark:text-yellow-400"
              : "bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400"
          }`}
        >
          {checkUpdateResult.hasUpdate
            ? `Update available: ${checkUpdateResult.currentVersion} → ${checkUpdateResult.latestVersion}`
            : `Up to date (${checkUpdateResult.currentVersion})`}
        </div>
      )}
      {checkUpdateResult?.error && (
        <div class="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-2 rounded-md text-sm">
          {checkUpdateResult.error}
        </div>
      )}

      {/* Update status messages */}
      {updateResult && !updateResult.error && updateResult.updated && (
        <div class="bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 px-4 py-2 rounded-md text-sm">
          {`Updated: ${updateResult.oldVersion} → ${updateResult.newVersion}`}
        </div>
      )}
      {updateResult?.error && (
        <div class="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-2 rounded-md text-sm">
          {updateResult.error}
        </div>
      )}

      {/* Overview + Usage Section */}
      <div class={`grid gap-4 ${tool.usage.totalCount > 0 ? "lg:grid-cols-2" : ""}`}>
        <TitledCard title="Overview" icon={<Info class="h-4 w-4" />}>
          <div class="space-y-3">
            <div class="flex items-center gap-2">
              <span class="text-sm text-muted-foreground w-24">Method</span>
              <InstallMethodBadge method={tool.config.installationMethod} ghCli={tool.config.installParams.ghCli} />
            </div>
            {getSourceDisplay(tool.config)}
            <div class="flex items-center gap-2">
              <span class="text-sm text-muted-foreground w-24">Version</span>
              <span class="font-medium">{tool.runtime.installedVersion || tool.config.version || "Unknown"}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-sm text-muted-foreground w-24">Installed</span>
              <span class="font-medium">
                {tool.runtime.installedAt ? new Date(tool.runtime.installedAt).toLocaleDateString() : "Not installed"}
              </span>
            </div>
            {tool.binaryDiskSize > 0 && (
              <div class="flex items-center gap-2">
                <span class="text-sm text-muted-foreground w-24">Binary Size</span>
                <span class="font-medium">{formatBytes(tool.binaryDiskSize)}</span>
              </div>
            )}
            {tool.config.hostname && (
              <div class="flex items-center gap-2">
                <span class="text-sm text-muted-foreground w-24">Hostname</span>
                <code class="text-sm font-mono bg-muted px-1.5 py-0.5 rounded">{tool.config.hostname}</code>
              </div>
            )}
            {tool.config.dependencies && tool.config.dependencies.length > 0 && (
              <div class="flex items-start gap-2">
                <span class="text-sm text-muted-foreground w-24">Depends on</span>
                <div class="flex flex-wrap gap-2">
                  {tool.config.dependencies.map((binaryName, i) => {
                    const linkedToolName = binaryToToolMap.get(binaryName);
                    return (
                      <a
                        key={i}
                        href={`/tools/${encodeURIComponent(linkedToolName ?? binaryName)}`}
                        class="text-sm text-blue-500 hover:underline"
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
                <span class="text-sm text-muted-foreground w-24">Required by</span>
                <div class="flex flex-wrap gap-2">
                  {dependentTools.map((depTool, i) => (
                    <a
                      key={i}
                      href={`/tools/${encodeURIComponent(depTool.config.name)}`}
                      class="text-sm text-blue-500 hover:underline"
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
              <div class="flex items-center gap-2">
                <span class="text-sm text-muted-foreground w-24">Total Runs</span>
                <span class="font-medium">{tool.usage.totalCount.toLocaleString()}</span>
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

      {/* Source Section */}
      <ToolSourceCard toolName={tool.config.name} />

      {/* Platform Configs Section - only shown when platform overrides exist */}
      {tool.config.platformConfigs && tool.config.platformConfigs.length > 0 && (
        <TitledCard title="Platform Configurations" icon={<Layers class="h-4 w-4" />}>
          <div class="space-y-3">
            {tool.config.platformConfigs.map((entry, i) => (
              <PlatformConfigEntry key={i} entry={entry} />
            ))}
          </div>
        </TitledCard>
      )}

      {/* Files Section - only shown when tool is installed */}
      {tool.runtime.status === "installed" && (
        <TitledCard title="Files" icon={<File class="h-4 w-4" />}>
          {(tool.files?.length || 0) > 0 ? (
            <FileTree nodes={fileRoots} />
          ) : (
            <div class="text-muted-foreground text-center py-4">No files tracked</div>
          )}
        </TitledCard>
      )}

      {/* History Section - only shown when tool is installed */}
      {tool.runtime.status === "installed" && (
        <TitledCard title="History" icon={<History class="h-4 w-4" />}>
          <ToolHistory
            entries={history?.entries ?? []}
            installedAt={history?.installedAt ?? null}
            dotfilesDir={history?.dotfilesDir ?? ""}
          />
        </TitledCard>
      )}

      {/* README Section - only for installers with GitHub repos */}
      {readmeRepo && <ReadmeCard toolName={tool.config.name} repo={readmeRepo} />}
    </div>
  );
}
