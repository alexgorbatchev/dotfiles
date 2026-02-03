import { type JSX } from 'preact';

import type { IDashboardStats, IToolDetail } from '../../shared/types';
import { StatCard } from '../components/StatCard';
import { Badge } from '../components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { useFetch } from '../hooks/useFetch';

export function Dashboard(): JSX.Element {
  const { data: stats, loading: statsLoading } = useFetch<IDashboardStats>('/stats');
  const { data: tools, loading: toolsLoading } = useFetch<IToolDetail[]>('/tools');

  const loading = statsLoading || toolsLoading;
  const toolsList = tools || [];

  if (loading) {
    return (
      <div class='flex items-center justify-center h-64'>
        <div class='text-muted-foreground'>Loading...</div>
      </div>
    );
  }

  const methodCounts = toolsList.reduce<Record<string, number>>((acc, tool) => {
    const method = tool.installMethod || 'unknown';
    acc[method] = (acc[method] || 0) + 1;
    return acc;
  }, {});

  const methodColors: Record<string, string> = {
    'github-release': 'bg-blue-500',
    brew: 'bg-orange-500',
    cargo: 'bg-orange-700',
    curl: 'bg-violet-500',
    manual: 'bg-slate-500',
    unknown: 'bg-muted',
  };

  return (
    <div class='space-y-6'>
      {/* Stats row */}
      <div class='grid grid-cols-2 md:grid-cols-4 gap-4'>
        <StatCard value={stats?.toolsInstalled || 0} label='Tools Installed' color='text-blue-400' />
        <StatCard value={stats?.updatesAvailable || 0} label='Updates Available' color='text-amber-400' />
        <StatCard value={stats?.filesTracked || 0} label='Files Tracked' color='text-green-400' />
        <StatCard value={stats?.totalOperations || 0} label='Operations' color='text-purple-400' />
      </div>

      {/* Recent tools and method distribution */}
      <div class='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        {/* Recent tools */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Installations</CardTitle>
          </CardHeader>
          <CardContent>
            <div class='space-y-2'>
              {toolsList.slice(0, 5).map((tool) => (
                <div key={tool.name} class='flex items-center justify-between py-2 border-b border-border'>
                  <div>
                    <span class='font-medium'>{tool.name}</span>
                    <span class='text-muted-foreground text-sm ml-2'>{tool.version}</span>
                  </div>
                  <Badge variant='success'>✓ Installed</Badge>
                </div>
              ))}
              {toolsList.length === 0 && (
                <div class='text-muted-foreground text-center py-4'>No tools installed yet</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Method distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Installation Methods</CardTitle>
          </CardHeader>
          <CardContent>
            <div class='space-y-3'>
              {Object.entries(methodCounts)
                .toSorted((a, b) => b[1] - a[1])
                .map(([method, count]) => {
                  const total = toolsList.length || 1;
                  const percent = Math.round((count / total) * 100);
                  return (
                    <div key={method}>
                      <div class='flex justify-between text-sm mb-1'>
                        <span>{method}</span>
                        <span class='text-muted-foreground'>
                          {count} ({percent}%)
                        </span>
                      </div>
                      <div class='h-2 bg-muted rounded'>
                        <div
                          class={`h-2 rounded ${methodColors[method] || methodColors['unknown']}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              {Object.keys(methodCounts).length === 0 && (
                <div class='text-muted-foreground text-center py-4'>No data</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
