import { type JSX } from 'preact';
import { useState } from 'preact/hooks';

import type { IToolDetail } from '../../shared/types';
import { TreeNode } from '../components/TreeNode';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { useFetch } from '../hooks/useFetch';
import { buildTreeForTool } from '../utils/tree';

interface ToolDetailProps {
  params: { name: string; };
}

export function ToolDetail({ params }: ToolDetailProps): JSX.Element {
  const toolName = decodeURIComponent(params.name);
  const { data: tools, loading } = useFetch<IToolDetail[]>('/tools', [toolName]);
  const [activeTab, setActiveTab] = useState<'overview' | 'files' | 'history'>('overview');

  const tool = tools?.find((t) => t.name === toolName) || null;

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
          <a href='/tools'>← Back to Tools</a>
        </Button>
      </div>
    );
  }

  const tabs: Array<'overview' | 'files' | 'history'> = ['overview', 'files', 'history'];
  const fileRoots = buildTreeForTool(tool.files || []);

  return (
    <div class='space-y-4'>
      {/* Back button */}
      <Button variant='ghost' size='sm' asChild>
        <a href='/tools'>← Back to Tools</a>
      </Button>

      {/* Header */}
      <Card>
        <CardContent class='pt-6'>
          <div class='flex items-center justify-between'>
            <div>
              <h1 class='text-2xl font-bold'>{tool.name}</h1>
              <p class='text-muted-foreground mt-1'>Version: {tool.version || 'Unknown'}</p>
            </div>
            <Badge variant={tool.status === 'installed' ? 'success' : 'secondary'}>
              {tool.status === 'installed' ? '✓ Installed' : 'Not Installed'}
            </Badge>
          </div>
          <div class='grid grid-cols-3 gap-4 mt-6'>
            <div>
              <div class='text-sm text-muted-foreground'>Method</div>
              <div class='font-medium'>{tool.installMethod || 'Unknown'}</div>
            </div>
            <div>
              <div class='text-sm text-muted-foreground'>Installed</div>
              <div class='font-medium'>
                {tool.installedAt ? new Date(tool.installedAt).toLocaleDateString() : 'Unknown'}
              </div>
            </div>
            <div>
              <div class='text-sm text-muted-foreground'>Files</div>
              <div class='font-medium'>{tool.files?.length || 0} files</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div class='border-b border-border'>
        <div class='flex space-x-4'>
          {tabs.map((tab) => (
            <Button
              key={tab}
              onClick={() => setActiveTab(tab)}
              variant={activeTab === tab ? 'default' : 'ghost'}
              class='rounded-none border-b-2 border-transparent data-[active=true]:border-primary'
              data-active={activeTab === tab}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <Card>
        <CardContent class='pt-4'>
          {activeTab === 'overview' && (
            <div class='space-y-4'>
              {tool.installPath && (
                <div>
                  <div class='text-sm text-muted-foreground mb-1'>Install Path</div>
                  <code class='text-sm bg-muted px-2 py-1 rounded'>{tool.installPath}</code>
                </div>
              )}
              {(tool.binaryPaths?.length || 0) > 0 && (
                <div>
                  <div class='text-sm text-muted-foreground mb-1'>Binaries</div>
                  <ul class='space-y-1'>
                    {tool.binaryPaths?.map((p, i) => (
                      <li key={i}>
                        <code class='text-sm bg-muted px-2 py-1 rounded'>{p}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {tool.downloadUrl && (
                <div>
                  <div class='text-sm text-muted-foreground mb-1'>Download URL</div>
                  <code class='text-sm bg-muted px-2 py-1 rounded break-all'>{tool.downloadUrl}</code>
                </div>
              )}
            </div>
          )}

          {activeTab === 'files' && (
            <div>
              {(tool.files?.length || 0) > 0 ?
                (
                  <div class='space-y-2'>
                    {fileRoots.map((node, i) => <TreeNode key={i} node={node} />)}
                  </div>
                ) :
                <div class='text-muted-foreground text-center py-4'>No files tracked</div>}
            </div>
          )}

          {activeTab === 'history' && (
            <div class='text-muted-foreground text-center py-4'>Installation history coming soon</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
