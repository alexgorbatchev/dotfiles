import { type ComponentChildren, type JSX } from "preact";

import { cn } from "../../lib/utils";

type CardProps = JSX.HTMLAttributes<HTMLDivElement> & {
  children?: ComponentChildren;
};

export function Card({ class: className, ...props }: CardProps): JSX.Element {
  return (
    <div
      data-testid="Card"
      data-slot="card"
      class={cn("bg-card text-card-foreground flex min-w-0 flex-col gap-2 rounded-xl border py-4 shadow-sm", className)}
      {...props}
    />
  );
}

export function CardHeader({ class: className, ...props }: CardProps): JSX.Element {
  return (
    <div
      data-testid="CardHeader"
      data-slot="card-header"
      class={cn(
        "@container/card-header grid min-w-0 auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-4 sm:px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ class: className, ...props }: CardProps): JSX.Element {
  return (
    <div
      data-testid="CardTitle"
      data-slot="card-title"
      class={cn("text-lg leading-none font-bold", className)}
      {...props}
    />
  );
}

export function CardContent({ class: className, ...props }: CardProps): JSX.Element {
  return (
    <div data-testid="CardContent" data-slot="card-content" class={cn("min-w-0 px-4 sm:px-6", className)} {...props} />
  );
}
