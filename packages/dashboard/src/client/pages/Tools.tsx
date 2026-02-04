import { type JSX } from 'preact';

import type { IToolDetail } from '../../shared/types';
import { RecentTools } from '../components/RecentTools';
import { StatCard } from '../components/StatCard';
import { ToolsTreeView } from '../components/ToolsTreeView';
import { useFetch } from '../hooks/useFetch';

export function Tools(): JSX.Element {
  const { data: tools, loading } = useFetch<IToolDetail[]>('/tools');

  const toolsList = tools || [];
  const totalFiles = toolsList.reduce((sum, t) => sum + (t.files?.length || 0), 0);
  const installedCount = toolsList.filter((t) => t.runtime.status === 'installed').length;

  if (loading) {
    return (
      <div class='flex items-center justify-center h-64'>
        <div class='text-muted-foreground'>Loading...</div>
      </div>
    );
  }

  return (
    <div class='space-y-4'>
      {/* Stats row */}
      <div class='grid grid-cols-3 gap-4'>
        <StatCard value={toolsList.length} label='Total Tools' color='text-blue-400' />
        <StatCard value={installedCount} label='Installed' color='text-green-400' />
        <StatCard value={totalFiles} label='Files Tracked' color='text-purple-400' />
      </div>

      {/* Tool files and recently added - same row */}
      <div class='grid grid-cols-3 gap-4'>
        <div class='col-span-2'>
          <ToolsTreeView tools={toolsList} />
        </div>
        <RecentTools />
      </div>

      {toolsList.length === 0 && <div class='text-center text-muted-foreground py-8'>No tools configured</div>}
    </div>
  );
}
