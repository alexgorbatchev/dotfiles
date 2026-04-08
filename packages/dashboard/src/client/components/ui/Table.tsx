import type { ComponentProps, JSX } from "preact";

import { cn } from "../../lib/utils";

export function Table({ class: className, ...props }: ComponentProps<"table">): JSX.Element {
  return (
    <div data-testid="Table" data-slot="table-container" class="relative w-full overflow-x-auto">
      <table data-slot="table" class={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader({ class: className, ...props }: ComponentProps<"thead">): JSX.Element {
  return <thead data-testid="TableHeader" data-slot="table-header" class={cn("[&_tr]:border-b", className)} {...props} />;
}

export function TableBody({ class: className, ...props }: ComponentProps<"tbody">): JSX.Element {
  return <tbody data-testid="TableBody" data-slot="table-body" class={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableFooter({ class: className, ...props }: ComponentProps<"tfoot">): JSX.Element {
  return (
    <tfoot
      data-testid="TableFooter"
      data-slot="table-footer"
      class={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  );
}

export function TableRow({ class: className, ...props }: ComponentProps<"tr">): JSX.Element {
  return (
    <tr
      data-testid="TableRow"
      data-slot="table-row"
      class={cn("border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted", className)}
      {...props}
    />
  );
}

export function TableHead({ class: className, ...props }: ComponentProps<"th">): JSX.Element {
  return (
    <th
      data-testid="TableHead"
      data-slot="table-head"
      class={cn(
        "h-10 whitespace-nowrap px-2 text-left align-middle font-medium text-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ class: className, ...props }: ComponentProps<"td">): JSX.Element {
  return (
    <td
      data-testid="TableCell"
      data-slot="table-cell"
      class={cn(
        "whitespace-nowrap p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  );
}

export function TableCaption({ class: className, ...props }: ComponentProps<"caption">): JSX.Element {
  return (
    <caption
      data-testid="TableCaption"
      data-slot="table-caption"
      class={cn("mt-4 text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}
