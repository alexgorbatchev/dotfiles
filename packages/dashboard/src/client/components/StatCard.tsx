interface StatCardProps {
  value: number | string;
  label: string;
  color?: string;
}

export function StatCard({ value, label, color = 'text-white' }: StatCardProps) {
  return (
    <div class='stat-card'>
      <div class={`text-3xl font-bold ${color}`}>{value}</div>
      <div class='text-gray-400 text-sm mt-1'>{label}</div>
    </div>
  );
}
