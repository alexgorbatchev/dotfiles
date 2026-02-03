import { type ComponentChildren, type JSX } from 'preact';

import { cn } from '../lib/utils';
import { Card, CardContent } from './ui/Card';

interface StatCardProps {
  value: number | string;
  label: string;
  color?: string;
  children?: ComponentChildren;
}

export function StatCard({ value, label, color = 'text-foreground' }: StatCardProps): JSX.Element {
  return (
    <Card class='text-center py-4'>
      <CardContent class='space-y-1'>
        <div class={cn('text-3xl font-bold', color)}>{value}</div>
        <div class='text-muted-foreground text-sm'>{label}</div>
      </CardContent>
    </Card>
  );
}
