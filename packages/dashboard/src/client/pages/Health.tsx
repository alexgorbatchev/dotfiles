import { useEffect, useState } from 'preact/hooks';
import type { IHealthStatus } from '../../shared/types';
import { fetchApi } from '../api';

export function Health() {
  const [health, setHealth] = useState<IHealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApi<IHealthStatus>('/health')
      .then((data) => {
        setHealth(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load health:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div class='flex items-center justify-center h-64'>
        <div class='text-gray-400'>Loading...</div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    healthy: 'bg-green-500',
    warning: 'bg-amber-500',
    unhealthy: 'bg-red-500',
  };

  const checkStatusColors: Record<string, string> = {
    pass: 'text-green-400',
    warn: 'text-amber-400',
    fail: 'text-red-400',
  };

  const checkIcons: Record<string, string> = {
    pass: '✓',
    warn: '⚠',
    fail: '✗',
  };

  return (
    <div class='space-y-6'>
      {/* Overall status */}
      <div class='bg-gray-800 rounded-lg p-6 text-center'>
        <div class={`w-4 h-4 rounded-full mx-auto mb-4 ${statusColors[health?.overall || 'healthy']}`} />
        <h2 class='text-2xl font-bold capitalize'>{health?.overall || 'Unknown'}</h2>
        <p class='text-gray-400 text-sm mt-2'>
          Last check: {health?.lastCheck ? new Date(health.lastCheck).toLocaleString() : 'Never'}
        </p>
      </div>

      {/* Individual checks */}
      <div class='bg-gray-800 rounded-lg p-4'>
        <h3 class='font-semibold mb-4'>Health Checks</h3>
        <div class='space-y-3'>
          {health?.checks?.map((check, i) => (
            <div key={i} class='flex items-start justify-between py-3 border-b border-gray-700'>
              <div>
                <div class='flex items-center space-x-2'>
                  <span class={checkStatusColors[check.status] || checkStatusColors['pass']}>
                    {checkIcons[check.status] || checkIcons['pass']}
                  </span>
                  <span class='font-medium'>{check.name}</span>
                </div>
                <p class='text-sm text-gray-400 mt-1'>{check.message}</p>
                {(check.details?.length || 0) > 0 && (
                  <ul class='text-xs text-gray-500 mt-2 space-y-1'>
                    {check.details?.map((d, j) => <li key={j}>• {d}</li>)}
                  </ul>
                )}
              </div>
            </div>
          )) || <div class='text-gray-400'>No checks available</div>}
        </div>
      </div>
    </div>
  );
}
