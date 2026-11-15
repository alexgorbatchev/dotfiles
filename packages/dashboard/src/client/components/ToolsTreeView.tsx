import { type JSX } from "preact";
import { FileCode, FolderTree } from "../icons";

import type { IFileTreeEntry, IToolConfigsTree, IToolDetail, ToolRuntimeStatus } from "../../shared/types";
import { useFetch } from "../hooks/useFetch";
import type { IUseToolActions } from "../hooks/useToolActions";
import { ToolActionButtons } from "./ToolActionButtons";
import { RequestStateNotice } from "./RequestStateNotice";
import { TitledCard } from "./ui/TitledCard";
import { Tree, type ITreeItemData } from "./ui/Tree";

type ToolsTreeViewProps = {
  tools: IToolDetail[];
  actions: IUseToolActions;
};

type ToolTreeData = {
  toolName?: string;
  isFile?: boolean;
  dirPath?: string;
  status?: ToolRuntimeStatus;
  installedVersion?: string;
};

/** Tool files get a decorated label; anything else falls back to the plain label text. */
type ToolTreeLabel = JSX.Element | string;

/**
 * Flatten the API file tree into one row per tool file, carrying the directory
 * path down as a prefix so each row can render as `dir/name`, sorted alphabetically
 * by tool name (the base name in [toolname].tool.ts), ignoring subfolder location.
 */
function flattenToolFiles(
  entries: IFileTreeEntry[],
  toolsByName: Map<string, IToolDetail>,
  dirPath: string = "",
): ITreeItemData<ToolTreeData>[] {
  const collect = (list: IFileTreeEntry[], currentDirPath: string): ITreeItemData<ToolTreeData>[] => {
    return list.flatMap((entry) => {
      if (entry.type === "directory") {
        return entry.children ? collect(entry.children, `${currentDirPath}${entry.name}/`) : [];
      }

      const tool = entry.toolName ? toolsByName.get(entry.toolName) : undefined;
      const status = tool?.runtime.status;
      const statusColor =
        status === "installed" ? "text-green-400" : status === "error" ? "text-red-400" : "text-blue-400";

      return [
        {
          id: entry.path,
          label: entry.name,
          icon: <FileCode class={`h-4 w-4 ${statusColor}`} />,
          iconDecorator: <span class={`inline-block w-2 h-2 rounded-full ${getStatusDotClass(status)}`} />,
          data: {
            toolName: entry.toolName,
            isFile: true,
            dirPath: currentDirPath,
            status,
            installedVersion: tool?.runtime.installedVersion ?? undefined,
          },
        },
      ];
    });
  };

  return collect(entries, dirPath).toSorted((leftItem, rightItem) => {
    const leftName = leftItem.label.replace(/\.tool\.ts$/, "");
    const rightName = rightItem.label.replace(/\.tool\.ts$/, "");
    const nameComparison = leftName.localeCompare(rightName);
    if (nameComparison !== 0) {
      return nameComparison;
    }
    return (leftItem.data?.dirPath ?? "").localeCompare(rightItem.data?.dirPath ?? "");
  });
}

/**
 * Get the status dot styling based on tool status. Uninstalled tools get an outline
 * rather than a fill so installed ones read as the solid state at a glance.
 */
function getStatusDotClass(status?: ToolRuntimeStatus): string {
  switch (status) {
    case "installed":
      return "bg-green-500";
    case "error":
      return "bg-red-500";
    default:
      return "border border-gray-300";
  }
}

const statusLabels: Record<ToolRuntimeStatus, string> = {
  installed: "Installed",
  "not-installed": "Not installed",
  error: "Installation error",
};

/** Keep the name, state and version readable before the row's independent actions. */
function renderLabel(item: ITreeItemData<ToolTreeData>): ToolTreeLabel {
  if (!item.data?.isFile || !item.label.endsWith(".tool.ts")) return item.label;
  const baseName = item.label.replace(/\.tool\.ts$/, "");
  const dirPath = item.data.dirPath ?? "";
  const toolName = item.data.toolName;
  const label = (
    <span class="min-w-0 [overflow-wrap:anywhere]">
      {dirPath && <span class="text-muted-foreground">{dirPath}</span>}
      {baseName}
      <span class="text-muted-foreground">.tool.ts</span>
    </span>
  );

  return (
    <span class="flex min-w-0 flex-col gap-1">
      {toolName ? (
        <a
          href={`/tools/${encodeURIComponent(toolName)}`}
          aria-label={`View ${toolName}`}
          class="flex min-h-11 min-w-0 items-center rounded font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring sm:min-h-6"
        >
          {label}
        </a>
      ) : (
        label
      )}
      {toolName && (
        <span class="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
          <span>{item.data.status ? statusLabels[item.data.status] : "Status unavailable"}</span>
          {item.data.status === "installed" && item.data.installedVersion && (
            <span>Version {item.data.installedVersion}</span>
          )}
        </span>
      )}
    </span>
  );
}

export function ToolsTreeView({ tools, actions }: ToolsTreeViewProps): JSX.Element {
  const { data: treeData, loading, error, refetch } = useFetch<IToolConfigsTree>("/tool-configs-tree");

  const toolsByName = new Map(tools.map((tool) => [tool.config.name, tool]));

  function renderActions(item: ITreeItemData<ToolTreeData>): JSX.Element | null {
    const toolName = item.data?.toolName;

    if (!toolName) {
      return null;
    }

    return (
      <ToolActionButtons
        toolName={toolName}
        isInstalled={item.data?.status === "installed"}
        actions={actions}
        size="xs"
      />
    );
  }

  const notice = (
    <RequestStateNotice
      label="Tool files"
      loading={loading}
      error={error}
      hasData={treeData !== null}
      onRetry={refetch}
    />
  );
  const roots = treeData?.roots ?? [];

  if (roots.length === 0) {
    return (
      <TitledCard title="Tool Files" icon={<FolderTree class="h-4 w-4" />}>
        {notice}
        {treeData !== null && !loading && !error && (
          <div class="text-muted-foreground text-sm">No tool files found</div>
        )}
      </TitledCard>
    );
  }

  return (
    <div data-testid="ToolsTreeView" class="min-w-0 space-y-4">
      {notice}
      {roots.map((root) => (
        <TitledCard key={root.path} title={root.label} icon={<FolderTree class="h-4 w-4" />}>
          <Tree
            items={flattenToolFiles(root.entries, toolsByName, "")}
            renderLabel={renderLabel}
            renderActions={renderActions}
            iconClassName="mr-1"
          />
        </TitledCard>
      ))}
    </div>
  );
}
