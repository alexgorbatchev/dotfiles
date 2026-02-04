import { type JSX } from 'preact';

import type { IToolDetail } from '../../shared/types';
import { InstallMethodBadge } from '../components/InstallMethodBadge';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { Table, TableBody, TableCell, TableRow } from '../components/ui/Table';
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

      {/* Tools table */}
      <ToolsTable tools={toolsList} />

      {toolsList.length === 0 && <div class='text-center text-muted-foreground py-8'>No tools configured</div>}
    </div>
  );
}

interface ToolsTableProps {
  tools: IToolDetail[];
}

function handleRowClick(toolName: string): void {
  window.location.href = `/tools/${encodeURIComponent(toolName)}`;
}

function ToolsTable({ tools }: ToolsTableProps): JSX.Element {
  return (
    <Table>
      <TableBody>
        {tools
          .toSorted((a, b) => a.config.name.localeCompare(b.config.name))
          .map((tool) => (
            <TableRow
              key={tool.config.name}
              class='cursor-pointer'
              onClick={() => handleRowClick(tool.config.name)}
            >
              <TableCell class='font-medium'>
                <div class='flex items-center space-x-2'>
                  <span
                    class={`w-2 h-2 rounded-full ${
                      tool.runtime.status === 'installed' ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  />
                  <span>{tool.config.name}</span>
                </div>
              </TableCell>
              <TableCell>
                <StatusBadge status={tool.runtime.status} />
              </TableCell>
              <TableCell class='text-right'>
                <div class='flex items-center justify-end space-x-3'>
                  <InstallMethodBadge method={tool.config.installationMethod} />
                  <span class='text-xs text-muted-foreground'>{tool.files?.length || 0} files</span>
                </div>
              </TableCell>
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );
}
