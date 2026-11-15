import type { ComponentChildren, JSX } from "preact";

import { Card, CardContent, CardHeader, CardTitle } from "./Card";

interface ITitledCardProps {
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
}: ITitledCardProps): JSX.Element {
  return (
    <Card class={className}>
      <CardHeader class="pb-2">
        <div class="flex flex-wrap items-start justify-between gap-2 min-w-0">
          <CardTitle class="flex min-w-0 items-start gap-2 text-lg font-semibold break-all [&>svg]:shrink-0">
            {icon}
            {title}
          </CardTitle>
          {action}
        </div>
      </CardHeader>
      <CardContent class={contentClass}>{children}</CardContent>
    </Card>
  );
}
