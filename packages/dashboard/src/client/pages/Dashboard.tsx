import { useEffect, useState } from 'preact/hooks';
import type { IDashboardStats, IToolDetail } from '../../shared/types';
import { fetchApi } from '../api';
import { StatCard } from '../components/StatCard';

export function Dashboard() {
  const [stats, setStats] = useState<IDashboardStats | null>(null);
  const [tools, setTools] = useState<IToolDetail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchApi<IDashboardStats>('/stats'), fetchApi<IToolDetail[]>('/tools')])
      .then(([statsData, toolsData]) => {
        setStats(statsData);
        setTools(toolsData);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load dashboard:', err);
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

  const methodCounts = tools.reduce<Record<string, number>>((acc, tool) => {
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
    unknown: 'bg-gray-500',
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
        <div class='bg-gray-800 rounded-lg p-4'>
          <h2 class='text-lg font-semibold mb-4'>Recent Installations</h2>
          <div class='space-y-2'>
            {tools.slice(0, 5).map((tool) => (
              <div key={tool.name} class='flex items-center justify-between py-2 border-b border-gray-700'>
                <div>
                  <span class='font-medium'>{tool.name}</span>
                  <span class='text-gray-400 text-sm ml-2'>{tool.version}</span>
                </div>
                <span class='status-badge bg-green-900 text-green-300'>✓ Installed</span>
              </div>
            ))}
            {tools.length === 0 && <div class='text-gray-400 text-center py-4'>No tools installed yet</div>}
          </div>
        </div>

        {/* Method distribution */}
        <div class='bg-gray-800 rounded-lg p-4'>
          <h2 class='text-lg font-semibold mb-4'>Installation Methods</h2>
          <div class='space-y-3'>
            {Object.entries(methodCounts)
              .toSorted((a, b) => b[1] - a[1])
              .map(([method, count]) => {
                const total = tools.length || 1;
                const percent = Math.round((count / total) * 100);
                return (
                  <div key={method}>
                    <div class='flex justify-between text-sm mb-1'>
                      <span>{method}</span>
                      <span class='text-gray-400'>
                        {count} ({percent}%)
                      </span>
                    </div>
                    <div class='h-2 bg-gray-700 rounded'>
                      <div
                        class={`h-2 rounded ${methodColors[method] || methodColors['unknown']}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            {Object.keys(methodCounts).length === 0 && <div class='text-gray-400 text-center py-4'>No data</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
