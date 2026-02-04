import { type JSX } from 'preact';

import type { IHealthStatus } from '../../shared/types';
import { Badge } from '../components/ui/Badge';
import { Card, CardContent } from '../components/ui/Card';
import { TitledCard } from '../components/ui/TitledCard';
import { useFetch } from '../hooks/useFetch';

export function Health(): JSX.Element {
  const { data: health, loading } = useFetch<IHealthStatus>('/health');

  if (loading) {
    return (
      <div class='flex items-center justify-center h-64'>
        <div class='text-muted-foreground'>Loading...</div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    healthy: 'bg-green-500',
    warning: 'bg-amber-500',
    unhealthy: 'bg-red-500',
  };

  const checkStatusVariants: Record<string, 'success' | 'warning' | 'error'> = {
    pass: 'success',
    warn: 'warning',
    fail: 'error',
  };

  const checkIcons: Record<string, string> = {
    pass: '✓',
    warn: '⚠',
    fail: '✗',
  };

  return (
    <div class='space-y-6'>
      {/* Overall status */}
      <Card class='text-center'>
        <CardContent class='pt-6'>
          <div class={`w-4 h-4 rounded-full mx-auto mb-4 ${statusColors[health?.overall || 'healthy']}`} />
          <h2 class='text-2xl font-bold capitalize'>{health?.overall || 'Unknown'}</h2>
          <p class='text-muted-foreground text-sm mt-2'>
            Last check: {health?.lastCheck ? new Date(health.lastCheck).toLocaleString() : 'Never'}
          </p>
        </CardContent>
      </Card>

      {/* Individual checks */}
      <TitledCard title='Health Checks'>
        <div class='space-y-3'>
          {health?.checks?.map((check, i) => (
            <div key={i} class='flex items-start justify-between py-3 border-b border-border'>
              <div>
                <div class='flex items-center space-x-2'>
                  <Badge variant={checkStatusVariants[check.status] || 'success'}>
                    {checkIcons[check.status] || checkIcons['pass']}
                  </Badge>
                  <span class='font-medium'>{check.name}</span>
                </div>
                <p class='text-sm text-muted-foreground mt-1'>{check.message}</p>
                {(check.details?.length || 0) > 0 && (
                  <ul class='text-xs text-muted-foreground/70 mt-2 space-y-1'>
                    {check.details?.map((d, j) => <li key={j}>• {d}</li>)}
                  </ul>
                )}
              </div>
            </div>
          )) || <div class='text-muted-foreground'>No checks available</div>}
        </div>
      </TitledCard>
    </div>
  );
}
