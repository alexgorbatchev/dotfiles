import { type JSX } from 'preact';

import type { IToolDetail, IToolHistory } from '../../shared/types';
import { InstallMethodBadge } from '../components/InstallMethodBadge';
import { ToolHistory } from '../components/ToolHistory';
import { TreeNode } from '../components/TreeNode';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { useFetch } from '../hooks/useFetch';
import { buildTreeForTool } from '../utils/tree';

interface ToolDetailProps {
  params: { name: string; };
}

export function ToolDetail({ params }: ToolDetailProps): JSX.Element {
  const toolName = decodeURIComponent(params.name);
  const { data: tools, loading: toolsLoading } = useFetch<IToolDetail[]>('/tools', [toolName]);
  const { data: history, loading: historyLoading } = useFetch<IToolHistory>(`/tools/${encodeURIComponent(toolName)}/history`, [toolName]);

  const tool = tools?.find((t) => t.config.name === toolName) || null;
  const loading = toolsLoading || historyLoading;

  if (loading) {
    return (
      <div class='flex items-center justify-center h-64'>
        <div class='text-muted-foreground'>Loading...</div>
      </div>
    );
  }

  if (!tool) {
    return (
      <div class='text-center py-8'>
        <div class='text-muted-foreground mb-4'>Tool not found</div>
        <Button variant='link' asChild>
          <a href='/'>← Back to Home</a>
        </Button>
      </div>
    );
  }

  const fileRoots = buildTreeForTool(tool.files || []);

  return (
    <div class='space-y-4'>
      {/* Back button */}
      <Button variant='ghost' size='sm' asChild>
        <a href='/'>← Back to Home</a>
      </Button>

      {/* Header */}
      <Card>
        <CardContent class='pt-6'>
          <div class='flex items-center justify-between'>
            <div>
              <h1 class='text-2xl font-bold'>{tool.config.name}</h1>
              <p class='text-muted-foreground mt-1'>
                Version: {tool.runtime.installedVersion || tool.config.version || 'Unknown'}
              </p>
            </div>
            <Badge variant={tool.runtime.status === 'installed' ? 'success' : 'secondary'}>
              {tool.runtime.status === 'installed' ? '✓ Installed' : 'Not Installed'}
            </Badge>
          </div>
          <div class='grid grid-cols-3 gap-4 mt-6'>
            <div>
              <div class='text-sm text-muted-foreground mb-1'>Method</div>
              <InstallMethodBadge method={tool.config.installationMethod} />
            </div>
            <div>
              <div class='text-sm text-muted-foreground'>Installed</div>
              <div class='font-medium'>
                {tool.runtime.installedAt ? new Date(tool.runtime.installedAt).toLocaleDateString() : 'Not installed'}
              </div>
            </div>
            <div>
              <div class='text-sm text-muted-foreground'>Files</div>
              <div class='font-medium'>{tool.files?.length || 0} files</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Overview Section */}
      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div class='space-y-4'>
            {tool.runtime.installPath && (
              <div>
                <div class='text-sm text-muted-foreground mb-1'>Install Path</div>
                <code class='text-sm bg-muted px-2 py-1 rounded'>{tool.runtime.installPath}</code>
              </div>
            )}
            {(tool.config.binaries?.length || 0) > 0 && (
              <div>
                <div class='text-sm text-muted-foreground mb-1'>Binaries</div>
                <ul class='space-y-1'>
                  {tool.config.binaries?.map((b, i) => (
                    <li key={i}>
                      <code class='text-sm bg-muted px-2 py-1 rounded'>
                        {typeof b === 'string' ? b : b.name}
                      </code>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {tool.config.installParams.repo && (
              <div>
                <div class='text-sm text-muted-foreground mb-1'>Repository</div>
                <code class='text-sm bg-muted px-2 py-1 rounded break-all'>
                  {tool.config.installParams.repo}
                </code>
              </div>
            )}
            {tool.config.dependencies && tool.config.dependencies.length > 0 && (
              <div>
                <div class='text-sm text-muted-foreground mb-1'>Dependencies</div>
                <div class='flex flex-wrap gap-2'>
                  {tool.config.dependencies.map((d, i) => (
                    <Badge key={i} variant='outline'>{d}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Files Section */}
      <Card>
        <CardHeader>
          <CardTitle>Files</CardTitle>
        </CardHeader>
        <CardContent>
          {(tool.files?.length || 0) > 0 ?
            (
              <div class='space-y-2'>
                {fileRoots.map((node, i) => <TreeNode key={i} node={node} />)}
              </div>
            ) :
            <div class='text-muted-foreground text-center py-4'>No files tracked</div>}
        </CardContent>
      </Card>

      {/* History Section */}
      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          <ToolHistory
            entries={history?.entries ?? []}
            installedAt={history?.installedAt ?? null}
          />
        </CardContent>
      </Card>
    </div>
  );
}
