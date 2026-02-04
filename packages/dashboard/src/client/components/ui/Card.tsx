import { type ComponentChildren, type JSX } from 'preact';

import { cn } from '../../lib/utils';

type CardProps = JSX.HTMLAttributes<HTMLDivElement> & {
  children?: ComponentChildren;
};

function Card({ class: className, ...props }: CardProps): JSX.Element {
  return (
    <div
      data-slot='card'
      class={cn('bg-card text-card-foreground flex flex-col gap-2 rounded-xl border py-6 shadow-sm', className)}
      {...props}
    />
  );
}

function CardHeader({ class: className, ...props }: CardProps): JSX.Element {
  return (
    <div
      data-slot='card-header'
      class={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ class: className, ...props }: CardProps): JSX.Element {
  return <div data-slot='card-title' class={cn('text-lg leading-none font-bold', className)} {...props} />;
}

function CardDescription({ class: className, ...props }: CardProps): JSX.Element {
  return <div data-slot='card-description' class={cn('text-muted-foreground text-sm', className)} {...props} />;
}

function CardAction({ class: className, ...props }: CardProps): JSX.Element {
  return (
    <div
      data-slot='card-action'
      class={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  );
}

function CardContent({ class: className, ...props }: CardProps): JSX.Element {
  return <div data-slot='card-content' class={cn('px-6', className)} {...props} />;
}

function CardFooter({ class: className, ...props }: CardProps): JSX.Element {
  return <div data-slot='card-footer' class={cn('flex items-center px-6 [.border-t]:pt-6', className)} {...props} />;
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
