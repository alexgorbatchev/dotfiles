import { type JSX } from "preact";
import { Clock, FileCode, GitBranch, HardDrive } from "../icons";

import type { IRecentTools, TimestampSource } from "../../shared/types";
import { inventoryToolHref } from "../utils/inventoryUtils";
import { useFetch } from "../hooks/useFetch";
import { RequestStateNotice } from "./RequestStateNotice";
import { TitledCard } from "./ui/TitledCard";

type TimestampSourceIconProps = {
  source: TimestampSource;
};

function TimestampSourceIcon({ source }: TimestampSourceIconProps): JSX.Element {
  if (source === "git") {
    return <GitBranch class="h-3 w-3 text-green-500" title="From git commit date" />;
  }
  return <HardDrive class="h-3 w-3 text-amber-500" title="From file modification time" />;
}

type RecentToolsProps = {
  returnTo?: string;
};

export function RecentTools({ returnTo }: RecentToolsProps): JSX.Element {
  const { data, loading, error, refetch } = useFetch<IRecentTools>("/recent-tools");

  const tools = data?.tools || [];

  return (
    <TitledCard
      title="Recently Added"
      icon={<Clock class="h-4 w-4 text-muted-foreground" />}
      contentClass="flex-1 overflow-auto"
    >
      <RequestStateNotice
        label="Recent tools"
        loading={loading}
        error={error}
        hasData={data !== null}
        onRetry={refetch}
      />
      {data && tools.length === 0 && !loading && !error ? (
        <div class="text-muted-foreground text-sm text-center py-4">No tools added yet</div>
      ) : tools.length > 0 ? (
        <div class="space-y-0">
          {tools.map((tool) => (
            <a
              key={tool.configFilePath}
              href={inventoryToolHref(tool.name, returnTo)}
              class="flex min-h-11 sm:min-h-6 flex-wrap items-center gap-2 py-1 rounded hover:bg-accent cursor-pointer text-sm group"
            >
              <FileCode class="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
              <span class="font-medium break-words [overflow-wrap:anywhere] text-sm flex-1 min-w-0">{tool.name}</span>
              <span class="flex items-center gap-1 text-sm text-muted-foreground">
                <TimestampSourceIcon source={tool.timestampSource} />
                {tool.relativeTime}
              </span>
            </a>
          ))}
        </div>
      ) : null}
    </TitledCard>
  );
}
