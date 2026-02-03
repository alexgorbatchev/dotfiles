import { type JSX } from 'preact';
import { useLocation } from 'preact-iso';
import { useCallback, useEffect, useState } from 'preact/hooks';

import type { IToolDetail } from '../../shared/types';
import { InstallMethodBadge } from '../components/InstallMethodBadge';
import { StatCard } from '../components/StatCard';
import { Table, TableBody, TableCell, TableRow } from '../components/ui/Table';
import { useFetch } from '../hooks/useFetch';

export function Tools(): JSX.Element {
  const { url } = useLocation();
  const { data: tools, loading } = useFetch<IToolDetail[]>('/tools');

  const getInitialFilters = useCallback(() => {
    const params = new URLSearchParams(url.split('?')[1] || '');
    return {
      search: params.get('search') || '',
      method: params.get('method') || '',
    };
  }, [url]);

  const [filter, setFilter] = useState(() => getInitialFilters().search);
  const [methodFilter, setMethodFilter] = useState(() => getInitialFilters().method);

  const updateUrlParams = useCallback(
    (search: string, method: string) => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (method) params.set('method', method);
      const queryString = params.toString();
      const newUrl = '/' + (queryString ? '?' + queryString : '');
      window.history.replaceState({}, '', newUrl);
    },
    [],
  );

  useEffect(() => {
    updateUrlParams(filter, methodFilter);
  }, [filter, methodFilter, updateUrlParams]);

  const toolsList = tools || [];

  const filteredTools = toolsList.filter((tool) => {
    const matchesSearch = !filter || tool.config.name.toLowerCase().includes(filter.toLowerCase());
    const matchesMethod = !methodFilter || tool.config.installationMethod === methodFilter;
    return matchesSearch && matchesMethod;
  });

  const methods = [...new Set(toolsList.map((t) => t.config.installationMethod))];
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

      {/* Toolbar */}
      <div class='flex items-center space-x-4'>
        <input
          type='text'
          placeholder='Search tools...'
          value={filter}
          onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
          class='bg-input border border-border rounded px-3 py-2 focus:outline-none focus:border-ring'
        />
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter((e.target as HTMLSelectElement).value)}
          class='bg-input border border-border rounded px-3 py-2'
        >
          <option value=''>All Methods</option>
          {methods.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <span class='text-muted-foreground text-sm'>{filteredTools.length} tools</span>
      </div>

      {/* Tools table */}
      <ToolsTable tools={filteredTools} />

      {filteredTools.length === 0 && (
        <div class='text-center text-muted-foreground py-8'>No tools found matching your criteria</div>
      )}
    </div>
  );
}

interface ToolsTableProps {
  tools: IToolDetail[];
}

function ToolsTable({ tools }: ToolsTableProps): JSX.Element {
  const handleRowClick = (toolName: string): void => {
    window.location.href = `/tools/${encodeURIComponent(toolName)}`;
  };

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
                  <span class={`w-2 h-2 rounded-full ${tool.runtime.status === 'installed' ? 'bg-green-500' : 'bg-muted'}`} />
                  <span>📦 {tool.config.name}</span>
                </div>
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

