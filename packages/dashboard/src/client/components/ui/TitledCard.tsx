import type { ComponentChildren, JSX } from 'preact';

import { Card, CardContent, CardHeader, CardTitle } from './Card';

interface TitledCardProps {
  title: string;
  icon?: JSX.Element;
  children: ComponentChildren;
  class?: string;
  contentClass?: string;
}

export function TitledCard({ title, icon, children, class: className, contentClass }: TitledCardProps): JSX.Element {
  return (
    <Card class={className}>
      <CardHeader class='pb-2'>
        <CardTitle class='flex items-center gap-2 text-lg font-semibold'>
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent class={contentClass}>
        {children}
      </CardContent>
    </Card>
  );
}
