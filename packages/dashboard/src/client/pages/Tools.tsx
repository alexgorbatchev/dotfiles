import { type JSX } from 'preact';
import { useLocation } from 'preact-iso';
import { useCallback, useEffect, useState } from 'preact/hooks';

import type { IToolDetail } from '../../shared/types';
import { StatCard } from '../components/StatCard';
import { TreeNode } from '../components/TreeNode';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { useFetch } from '../hooks/useFetch';
import { buildTreeForTool } from '../utils/tree';

export function Tools(): JSX.Element {
  const { url } = useLocation();
  const { data: tools, loading } = useFetch<IToolDetail[]>('/tools');
  const [viewMode, setViewMode] = useState<'grid' | 'files'>('grid');

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
      const newUrl = '/tools' + (queryString ? '?' + queryString : '');
      window.history.replaceState({}, '', newUrl);
    },
    [],
  );

  useEffect(() => {
    updateUrlParams(filter, methodFilter);
  }, [filter, methodFilter, updateUrlParams]);

  const toolsList = tools || [];

  const filteredTools = toolsList.filter((tool) => {
    const matchesSearch = !filter || tool.name.toLowerCase().includes(filter.toLowerCase());
    const matchesMethod = !methodFilter || tool.installMethod === methodFilter;
    return matchesSearch && matchesMethod;
  });

  const methods = [...new Set(toolsList.map((t) => t.installMethod).filter(Boolean))] as string[];
  const totalFiles = toolsList.reduce((sum, t) => sum + (t.files?.length || 0), 0);
  const installedCount = toolsList.filter((t) => t.status === 'installed').length;

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
      <div class='flex items-center justify-between'>
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
        <div class='flex items-center space-x-2'>
          <Button
            onClick={() => setViewMode('grid')}
            variant={viewMode === 'grid' ? 'default' : 'secondary'}
            size='sm'
          >
            ⊞ Grid
          </Button>
          <Button
            onClick={() => setViewMode('files')}
            variant={viewMode === 'files' ? 'default' : 'secondary'}
            size='sm'
          >
            🌳 Files
          </Button>
        </div>
      </div>

      {/* Grid view */}
      {viewMode === 'grid' && (
        <div class='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
          {filteredTools.map((tool) => (
            <a key={tool.name} href={`/tools/${encodeURIComponent(tool.name)}`}>
              <Card class='hover:bg-accent transition-colors cursor-pointer'>
                <CardContent class='pt-4'>
                  <div class='flex items-center justify-between mb-2'>
                    <span class='font-semibold'>{tool.name}</span>
                    <span class={`w-2 h-2 rounded-full ${tool.status === 'installed' ? 'bg-green-500' : 'bg-muted'}`} />
                  </div>
                  <div class='text-sm text-muted-foreground'>{tool.version || 'Unknown version'}</div>
                  <div class='mt-2 flex items-center justify-between'>
                    <Badge variant='outline'>{tool.installMethod || 'manual'}</Badge>
                    {(tool.files?.length || 0) > 0 && (
                      <span class='text-xs text-muted-foreground'>{tool.files?.length} files</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </a>
          ))}
        </div>
      )}

      {/* Files view */}
      {viewMode === 'files' && <ToolFilesView tools={filteredTools} />}

      {filteredTools.length === 0 && (
        <div class='text-center text-muted-foreground py-8'>No tools found matching your criteria</div>
      )}
    </div>
  );
}

interface ToolFilesViewProps {
  tools: IToolDetail[];
}

function ToolFilesView({ tools }: ToolFilesViewProps): JSX.Element {
  const toolsWithFiles = tools.filter((t) => (t.files?.length || 0) > 0);

  if (toolsWithFiles.length === 0) {
    return (
      <Card class='text-center'>
        <CardContent class='py-8 text-muted-foreground'>No files tracked yet</CardContent>
      </Card>
    );
  }

  return (
    <div class='space-y-4'>
      {toolsWithFiles
        .toSorted((a, b) => a.name.localeCompare(b.name))
        .map((tool) => {
          const roots = buildTreeForTool(tool.files || []);
          return (
            <Card key={tool.name}>
              <CardHeader class='py-3'>
                {/* Tool header */}
                <a
                  href={`/tools/${encodeURIComponent(tool.name)}`}
                  class='flex items-center justify-between cursor-pointer hover:bg-accent -m-2 p-2 rounded'
                >
                  <div class='flex items-center space-x-3'>
                    <span
                      class={`w-2 h-2 rounded-full ${tool.status === 'installed' ? 'bg-green-500' : 'bg-muted'}`}
                    />
                    <CardTitle class='text-blue-400'>📦 {tool.name}</CardTitle>
                    {tool.version && <span class='text-sm text-muted-foreground'>{tool.version}</span>}
                  </div>
                  <div class='flex items-center space-x-3'>
                    <Badge variant='outline'>{tool.installMethod || 'manual'}</Badge>
                    <span class='text-xs text-muted-foreground'>{tool.files?.length} files</span>
                    <span class='text-muted-foreground'>→</span>
                  </div>
                </a>
              </CardHeader>
              {/* File tree */}
              <CardContent class='border-t border-border pt-3'>
                {roots.map((node, i) => <TreeNode key={i} node={node} />)}
              </CardContent>
            </Card>
          );
        })}
    </div>
  );
}
