import type { ComponentChildren } from "preact";
import { type JSX } from "preact";
import { FileCode, FolderTree } from "../icons";

import type { IFileTreeEntry, IToolConfigsTree, IToolDetail, ToolRuntimeStatus } from "../../shared/types";
import { useFetch } from "../hooks/useFetch";
import type { IUseToolActions } from "../hooks/useToolActions";
import { ToolActionButtons } from "./ToolActionButtons";
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

/**
 * Flatten the API file tree into one row per tool file, carrying the directory
 * path down as a prefix so each row can render as `dir/name`.
 */
function flattenToolFiles(
  entries: IFileTreeEntry[],
  toolsByName: Map<string, IToolDetail>,
  dirPath: string,
): ITreeItemData<ToolTreeData>[] {
  return entries.flatMap((entry) => {
    if (entry.type === "directory") {
      return entry.children ? flattenToolFiles(entry.children, toolsByName, `${dirPath}${entry.name}/`) : [];
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
          dirPath,
          status,
          installedVersion: tool?.runtime.installedVersion ?? undefined,
        },
      },
    ];
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

/**
 * Custom label renderer that dims the directory path and .tool.ts extension so
 * the tool name stands out, and trails the installed version when there is one.
 */
function renderLabel(item: ITreeItemData<ToolTreeData>): ComponentChildren {
  if (item.data?.isFile && item.label.endsWith(".tool.ts")) {
    const baseName = item.label.replace(/\.tool\.ts$/, "");
    const dirPath = item.data.dirPath ?? "";
    const isInstalled = item.data.status === "installed";
    const installedVersion = item.data.installedVersion;

    return (
      <span class="flex flex-1 items-center justify-between gap-2">
        <span class="min-w-0 truncate">
          {dirPath && <span class="text-muted-foreground">{dirPath}</span>}
          {baseName}
          <span class="text-muted-foreground">.tool.ts</span>
        </span>
        {isInstalled && installedVersion && (
          <span class="flex-shrink-0 text-xs text-muted-foreground/70">{installedVersion}</span>
        )}
      </span>
    );
  }
  return item.label;
}

function handleItemClick(item: ITreeItemData<ToolTreeData>): void {
  if (item.data?.toolName) {
    window.location.href = `/tools/${encodeURIComponent(item.data.toolName)}`;
  }
}

export function ToolsTreeView({ tools, actions }: ToolsTreeViewProps): JSX.Element {
  const { data: treeData, loading } = useFetch<IToolConfigsTree>("/tool-configs-tree");

  const toolsByName = new Map(tools.map((tool) => [tool.config.name, tool]));

  function renderActions(item: ITreeItemData<ToolTreeData>): ComponentChildren {
    const toolName = item.data?.toolName;

    if (!toolName) {
      return null;
    }

    return (
      <span onClick={(event) => event.stopPropagation()}>
        <ToolActionButtons
          toolName={toolName}
          isInstalled={item.data?.status === "installed"}
          actions={actions}
          size="xs"
        />
      </span>
    );
  }

  if (loading) {
    return (
      <TitledCard title="Tool Files" icon={<FolderTree class="h-4 w-4" />}>
        <div class="text-muted-foreground text-sm">Loading...</div>
      </TitledCard>
    );
  }

  const roots = treeData?.roots ?? [];

  if (roots.length === 0) {
    return (
      <TitledCard title="Tool Files" icon={<FolderTree class="h-4 w-4" />}>
        <div class="text-muted-foreground text-sm">No tool files found</div>
      </TitledCard>
    );
  }

  return (
    <div data-testid="ToolsTreeView" class="space-y-4">
      {roots.map((root) => (
        <TitledCard key={root.path} title={root.label} icon={<FolderTree class="h-4 w-4" />}>
          <Tree
            items={flattenToolFiles(root.entries, toolsByName, "")}
            onItemClick={handleItemClick}
            renderLabel={renderLabel}
            renderActions={renderActions}
            iconClassName="mr-1"
          />
        </TitledCard>
      ))}
    </div>
  );
}
