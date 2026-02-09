import {
  Clock,
  Copy,
  File,
  FilePlus,
  FolderPlus,
  Link,
  Shield,
  Trash2,
} from 'lucide-preact';
import { type JSX } from 'preact';

import type { IToolHistoryEntry } from '../../shared/types';
import { Badge } from './ui/Badge';

interface ToolHistoryProps {
  entries: IToolHistoryEntry[];
  installedAt: string | null;
  dotfilesDir: string;
}

const operationIcons: Record<string, JSX.Element> = {
  writeFile: <FilePlus class='h-4 w-4' />,
  chmod: <Shield class='h-4 w-4' />,
  rm: <Trash2 class='h-4 w-4' />,
  mkdir: <FolderPlus class='h-4 w-4' />,
  symlink: <Link class='h-4 w-4' />,
  rename: <File class='h-4 w-4' />,
  cp: <Copy class='h-4 w-4' />,
};

const operationLabels: Record<string, string> = {
  writeFile: 'Created',
  chmod: 'Permissions',
  rm: 'Removed',
  mkdir: 'Directory',
  symlink: 'Linked',
  rename: 'Renamed',
  cp: 'Copied',
};

/**
 * Operations where the fileType badge provides useful context.
 * For structural operations (mkdir, chmod) the fileType is less meaningful.
 */
const SHOW_FILETYPE_FOR_OPERATIONS = new Set(['writeFile', 'cp', 'rename', 'rm']);

function getDisplayPath(filePath: string, dotfilesDir: string): string {
  if (filePath.startsWith(dotfilesDir)) {
    const relativePath = filePath.slice(dotfilesDir.length);
    return `<dotfiles>${relativePath}`;
  }
  return filePath;
}

export function ToolHistory({ entries, installedAt, dotfilesDir }: ToolHistoryProps): JSX.Element {
  if (entries.length === 0 && !installedAt) {
    return (
      <div class='text-muted-foreground text-center py-4'>
        No history recorded
      </div>
    );
  }

  return (
    <div class='space-y-4'>
      {installedAt && (
        <div class='flex items-center gap-3 p-3 rounded-lg bg-muted/50'>
          <div class='flex items-center justify-center w-8 h-8 rounded-full bg-green-500/20 text-green-500'>
            <Clock class='h-4 w-4' />
          </div>
          <div>
            <div class='font-medium'>Installed</div>
            <div class='text-sm text-muted-foreground'>
              {new Date(installedAt).toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {entries.length > 0 && (
        <div class='relative'>
          <div class='absolute left-4 top-0 bottom-0 w-px bg-border' />
          <div class='space-y-3'>
            {entries.map((entry) => (
              <div key={entry.id} class='relative flex items-start gap-3 pl-8'>
                <div class='absolute left-2 top-1 flex items-center justify-center w-4 h-4 rounded-full bg-background border border-border'>
                  <div class='w-2 h-2 rounded-full bg-muted-foreground' />
                </div>
                <div class='flex-1 min-w-0'>
                  <div class='flex items-center gap-2'>
                    <span class='text-muted-foreground'>
                      {operationIcons[entry.operationType] || <File class='h-4 w-4' />}
                    </span>
                    <span class='font-medium'>
                      {operationLabels[entry.operationType] || entry.operationType}
                    </span>
                    {SHOW_FILETYPE_FOR_OPERATIONS.has(entry.operationType) && (
                      <Badge variant='outline' class='text-xs'>
                        {entry.fileType}
                      </Badge>
                    )}
                    <span class='text-xs text-muted-foreground ml-auto'>
                      {entry.relativeTime}
                    </span>
                  </div>
                  <div class='text-sm text-muted-foreground truncate mt-1' title={entry.filePath}>
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
