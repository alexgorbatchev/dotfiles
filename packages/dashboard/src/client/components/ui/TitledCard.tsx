import type { ComponentChildren, JSX } from 'preact';

import { Card, CardContent, CardHeader, CardTitle } from './Card';

interface TitledCardProps {
  title: string;
  icon: JSX.Element;
  action?: JSX.Element;
  children: ComponentChildren;
  class?: string;
  contentClass?: string;
}

export function TitledCard({
  title,
  icon,
  action,
  children,
  class: className,
  contentClass,
}: TitledCardProps): JSX.Element {
  return (
    <Card class={className}>
      <CardHeader class='pb-2'>
        <div class='flex items-center justify-between'>
          <CardTitle class='flex items-center gap-2 text-lg font-semibold'>
            {icon}
            {title}
          </CardTitle>
          {action}
        </div>
      </CardHeader>
      <CardContent class={contentClass}>
        {children}
      </CardContent>
    </Card>
  );
}
