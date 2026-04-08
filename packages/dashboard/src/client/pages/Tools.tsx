import { type JSX } from "preact";

import type { IToolDetail } from "../../shared/types";
import { RecentTools } from "../components/RecentTools";
import { StatCard } from "../components/StatCard";
import { ToolsTreeView } from "../components/ToolsTreeView";
import { TitledCard } from "../components/ui/TitledCard";
import { useFetch } from "../hooks/useFetch";
import { History, Zap } from "../icons";
import { formatBytes } from "../utils/format";

interface IUsageListItem {
  name: string;
  count: number;
  lastUsedAt: number;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) {
    return "just now";
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

function getToolLastUsedAt(tool: IToolDetail): number {
  return tool.usage.binaries.reduce((latest, item) => {
    if (!item.lastUsedAt) {
      return latest;
    }

    const timestamp = Date.parse(item.lastUsedAt);
    if (Number.isNaN(timestamp)) {
      return latest;
    }

    return Math.max(latest, timestamp);
  }, 0);
}

function buildUsageItems(tools: IToolDetail[]): IUsageListItem[] {
  return tools
    .map((tool) => ({
      name: tool.config.name,
      count: tool.usage.totalCount,
      lastUsedAt: getToolLastUsedAt(tool),
    }))
    .filter((tool) => tool.count > 0);
}

type UsageListCardProps = {
  title: string;
  icon: JSX.Element;
  items: IUsageListItem[];
  secondary: (item: IUsageListItem) => string;
  emptyText: string;
};

function UsageListCard({ title, icon, items, secondary, emptyText }: UsageListCardProps): JSX.Element {
  return (
    <TitledCard title={title} icon={icon} class="h-full" contentClass="flex-1 overflow-auto">
      {items.length === 0 ? (
        <div class="text-muted-foreground text-sm text-center py-4">{emptyText}</div>
      ) : (
        <div class="space-y-0">
          {items.map((item) => (
            <a
              key={item.name}
              href={`/tools/${encodeURIComponent(item.name)}`}
              class="flex items-center gap-2 py-1 rounded hover:bg-accent cursor-pointer text-sm group"
            >
              <span class="font-medium truncate text-sm flex-1 min-w-0">{item.name}</span>
              <span class="text-xs text-muted-foreground flex-shrink-0">{secondary(item)}</span>
            </a>
          ))}
        </div>
      )}
    </TitledCard>
  );
}

export function Tools(): JSX.Element {
  const { data: tools, loading } = useFetch<IToolDetail[]>("/tools");

  const toolsList = tools || [];
  const totalFiles = toolsList.reduce((sum, t) => sum + (t.files?.length || 0), 0);
  const installedCount = toolsList.filter((t) => t.runtime.status === "installed").length;
  const binariesDiskSize = toolsList.reduce((sum, t) => sum + (t.binaryDiskSize || 0), 0);
  const usageItems = buildUsageItems(toolsList);
  const mostUsed = usageItems.toSorted((a, b) => b.count - a.count || b.lastUsedAt - a.lastUsedAt).slice(0, 10);
  const mostRecentlyUsed = usageItems.toSorted((a, b) => b.lastUsedAt - a.lastUsedAt || b.count - a.count).slice(0, 10);

  if (loading) {
    return (
      <div class="flex items-center justify-center h-64">
        <div class="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div class="space-y-4">
      {/* Stats row */}
      <div class="grid grid-cols-4 gap-4">
        <StatCard value={toolsList.length} label="Total Tools" color="text-blue-400" />
        <StatCard value={installedCount} label="Installed" color="text-green-400" />
        <StatCard value={totalFiles} label="Files Tracked" color="text-purple-400" />
        <StatCard value={formatBytes(binariesDiskSize)} label="Binary Size" color="text-orange-400" />
      </div>

      {/* Activity row */}
      <div class="grid gap-4 lg:grid-cols-3">
        <RecentTools />
        <UsageListCard
          title="Most Recently Used"
          icon={<History class="h-4 w-4 text-muted-foreground" />}
          items={mostRecentlyUsed}
          secondary={(item) => formatRelativeTime(item.lastUsedAt)}
          emptyText="No usage recorded yet"
        />
        <UsageListCard
          title="Most Used"
          icon={<Zap class="h-4 w-4 text-muted-foreground" />}
          items={mostUsed}
          secondary={(item) => `${item.count.toLocaleString()} runs`}
          emptyText="No usage recorded yet"
        />
      </div>

      {/* Tool files row */}
      <div>
        <ToolsTreeView tools={toolsList} />
      </div>

      {toolsList.length === 0 && <div class="text-center text-muted-foreground py-8">No tools configured</div>}
    </div>
  );
}
