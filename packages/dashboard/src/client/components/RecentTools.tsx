import { Clock, FileCode, GitBranch, HardDrive } from 'lucide-preact';
import { type JSX } from 'preact';

import type { IRecentTools, TimestampSource } from '../../shared/types';
import { useFetch } from '../hooks/useFetch';
import { TitledCard } from './ui/TitledCard';

function TimestampSourceIcon({ source }: { source: TimestampSource; }): JSX.Element {
  if (source === 'git') {
    return <GitBranch class='h-3 w-3 text-green-500' title='From git commit date' />;
  }
  return <HardDrive class='h-3 w-3 text-amber-500' title='From file modification time' />;
}

export function RecentTools(): JSX.Element {
  const { data, loading } = useFetch<IRecentTools>('/recent-tools');

  const tools = data?.tools || [];

  return (
    <TitledCard
      title='Recently Added'
      icon={<Clock class='h-4 w-4 text-muted-foreground' />}
      class='h-full'
      contentClass='flex-1 overflow-auto'
    >
      {loading ?
        <div class='text-muted-foreground text-sm'>Loading...</div> :
        tools.length === 0 ?
        <div class='text-muted-foreground text-sm text-center py-4'>No tools added yet</div> :
        (
          <div class='space-y-0'>
            {tools.map((tool) => (
              <a
                key={tool.configFilePath}
                href={`/tools/${encodeURIComponent(tool.name)}`}
                class='flex items-center gap-2 py-1 rounded hover:bg-accent cursor-pointer text-sm group'
              >
                <FileCode class='h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0' />
                <span class='font-medium truncate text-sm flex-1 min-w-0'>{tool.name}</span>
                <span class='flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0'>
                  <TimestampSourceIcon source={tool.timestampSource} />
                  {tool.relativeTime}
                </span>
              </a>
            ))}
          </div>
        )}
    </TitledCard>
  );
}
