import { type JSX } from "preact";
import { Clock, Copy, File, FilePlus, FolderPlus, Link, Shield, Trash2 } from "../icons";

import type { IToolHistoryEntry } from "../../shared/types";

interface IToolHistoryProps {
  entries: IToolHistoryEntry[];
  installedAt: string | null;
  dotfilesDir: string;
}

const operationIcons: Record<string, JSX.Element> = {
  writeFile: <FilePlus class="h-4 w-4" />,
  chmod: <Shield class="h-4 w-4" />,
  rm: <Trash2 class="h-4 w-4" />,
  mkdir: <FolderPlus class="h-4 w-4" />,
  symlink: <Link class="h-4 w-4" />,
  rename: <File class="h-4 w-4" />,
  cp: <Copy class="h-4 w-4" />,
};

const operationLabels: Record<string, string> = {
  writeFile: "Created",
  chmod: "Permissions",
  rm: "Removed",
  mkdir: "Directory",
  symlink: "Linked",
  rename: "Renamed",
  cp: "Copied",
};

function getDisplayPath(filePath: string, dotfilesDir: string): string {
  if (filePath.startsWith(dotfilesDir)) {
    const relativePath = filePath.slice(dotfilesDir.length);
    return `<dotfiles>${relativePath}`;
  }
  return filePath;
}

export function ToolHistory({ entries, installedAt, dotfilesDir }: IToolHistoryProps): JSX.Element {
  if (entries.length === 0 && !installedAt) {
    return (
      <div data-testid="ToolHistory" class="text-muted-foreground py-4 text-center">
        No history recorded
      </div>
    );
  }

  return (
    <div data-testid="ToolHistory" class="space-y-4">
      {installedAt && (
        <div class="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
          <div class="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/20 text-green-500">
            <Clock class="h-4 w-4" />
          </div>
          <div>
            <div class="font-medium">Installed</div>
            <div class="text-sm text-muted-foreground">{new Date(installedAt).toLocaleString()}</div>
          </div>
        </div>
      )}

      {entries.length > 0 && (
        <div class="relative">
          <div class="absolute left-4 top-0 bottom-0 w-px bg-border" />
          <div class="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} class="relative flex items-start gap-3 pl-8">
                <div class="absolute left-2 top-1 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background">
                  <div class="h-2 w-2 rounded-full bg-muted-foreground" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-muted-foreground">
                      {operationIcons[entry.operationType] || <File class="h-4 w-4" />}
                    </span>
                    <span class="font-medium">{operationLabels[entry.operationType] || entry.operationType}</span>
                    <span class="ml-auto text-xs text-muted-foreground">{entry.relativeTime}</span>
                  </div>
                  <div class="mt-1 truncate text-sm text-muted-foreground" title={entry.filePath}>
                    {getDisplayPath(entry.filePath, dotfilesDir)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
