import { type JSX } from "preact";
import { useState } from "preact/hooks";

import type { IToolDetail } from "../../shared/types";
import { RecentTools } from "../components/RecentTools";
import { FirstToolSetup } from "../components/FirstToolSetup";
import { RequestStateNotice } from "../components/RequestStateNotice";
import { ToolsTreeView } from "../components/ToolsTreeView";
import { TitledCard } from "../components/ui/TitledCard";
import { useFetch } from "../hooks/useFetch";
import { useInventoryQuery } from "../hooks/useInventoryQuery";
import { inventoryToolHref } from "../utils/inventoryUtils";
import { useSectionHash } from "../hooks/useSectionHash";
import { useToolActions } from "../hooks/useToolActions";
import { History } from "../icons";
import { formatBytes } from "../utils/format";
import { formatRelativeTime, getLastUsedAt } from "../utils/usageUtils";

const TOOLS_SECTION_IDS = ["overview", "tool-files", "activity"] as const;

interface IUsageListItem {
  name: string;
  lastUsedAt: number;
}

function buildUsageItems(tools: IToolDetail[]): IUsageListItem[] {
  return tools.flatMap((tool) => {
    const lastUsedAt = getLastUsedAt(tool.usage);
    return lastUsedAt === null ? [] : [{ name: tool.config.name, lastUsedAt }];
  });
}

type UsageListCardProps = {
  title: string;
  icon: JSX.Element;
  items: IUsageListItem[];
  returnTo: string;
};

function UsageListCard({ title, icon, items, returnTo }: UsageListCardProps): JSX.Element {
  const [now] = useState(Date.now);
  return (
    <TitledCard title={title} icon={icon} class="h-full" contentClass="flex-1 overflow-auto">
      <div class="space-y-0">
        {items.map((item) => (
          <a
            key={item.name}
            href={inventoryToolHref(item.name, returnTo)}
            class="group flex min-h-11 sm:min-h-6 cursor-pointer flex-wrap items-center gap-2 rounded py-1 text-sm hover:bg-accent"
          >
            <span class="min-w-0 flex-1 break-words [overflow-wrap:anywhere] text-sm font-medium">{item.name}</span>
            <time
              dateTime={new Date(item.lastUsedAt).toISOString()}
              title={new Date(item.lastUsedAt).toLocaleString()}
              class="text-sm text-muted-foreground"
            >
              {formatRelativeTime(item.lastUsedAt, now)}
            </time>
          </a>
        ))}
      </div>
    </TitledCard>
  );
}

export function Tools(): JSX.Element {
  const { data: tools, loading, error, refetch } = useFetch<IToolDetail[]>("/tools");
  const actions = useToolActions();
  const inventory = useInventoryQuery();

  useSectionHash(TOOLS_SECTION_IDS, !loading);

  const toolsList = tools || [];
  const totalFiles = toolsList.reduce((sum, tool) => sum + (tool.files?.length || 0), 0);
  const installedCount = toolsList.filter((tool) => tool.runtime.status === "installed").length;
  const binariesDiskSize = toolsList.reduce((sum, tool) => sum + (tool.binaryDiskSize || 0), 0);
  const usageItems = buildUsageItems(toolsList);
  const mostRecentlyUsed = usageItems
    .toSorted(
      (leftItem, rightItem) =>
        rightItem.lastUsedAt - leftItem.lastUsedAt || leftItem.name.localeCompare(rightItem.name),
    )
    .slice(0, 10);

  if (tools === null) {
    return (
      <div data-testid="Tools">
        <RequestStateNotice label="Tools" loading={loading} error={error} hasData={false} onRetry={refetch} />
      </div>
    );
  }

  if (tools.length === 0) {
    return (
      <div data-testid="Tools" class="space-y-4">
        <h1 class="text-xl font-semibold">Tools</h1>
        <RequestStateNotice label="Tools" loading={loading} error={error} hasData onRetry={refetch} />
        {!error && !loading && <FirstToolSetup onRecheck={refetch} />}
      </div>
    );
  }

  return (
    <div data-testid="Tools" class="space-y-4">
      <RequestStateNotice label="Tools" loading={loading} error={error} hasData onRetry={refetch} />

      <section id="overview" class="space-y-1">
        <h1 class="text-xl font-semibold">Tools</h1>
        <p class="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>{toolsList.length} total</span>
          <span>{installedCount} installed</span>
          <span>{totalFiles} tracked files</span>
          <span>{formatBytes(binariesDiskSize)} binaries</span>
        </p>
      </section>

      <section id="tool-files" aria-label="Tools workspace">
        <ToolsTreeView tools={toolsList} actions={actions} inventory={inventory} />
      </section>

      <details id="activity" class="rounded-lg border p-3">
        <summary class="min-h-11 cursor-pointer content-center rounded font-medium focus-visible:outline-2 focus-visible:outline-ring">
          Activity · recent additions and usage
        </summary>
        <div class="mt-3 grid items-start gap-4 lg:grid-cols-2">
          <RecentTools returnTo={inventory.returnTo} />
          {usageItems.length === 0 ? (
            <p class="text-sm text-muted-foreground">
              No usage recorded yet. Run a managed tool to start collecting activity.
            </p>
          ) : (
            <UsageListCard
              title="Most Recently Used"
              icon={<History class="h-4 w-4 text-muted-foreground" />}
              items={mostRecentlyUsed}
              returnTo={inventory.returnTo}
            />
          )}
        </div>
      </details>
    </div>
  );
}
