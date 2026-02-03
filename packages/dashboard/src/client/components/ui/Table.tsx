import type { ComponentProps } from 'preact';

import { cn } from '../../lib/utils';

function Table({ class: className, ...props }: ComponentProps<'table'>): preact.JSX.Element {
  return (
    <div data-slot='table-container' class='relative w-full overflow-x-auto'>
      <table data-slot='table' class={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}

function TableHeader({ class: className, ...props }: ComponentProps<'thead'>): preact.JSX.Element {
  return <thead data-slot='table-header' class={cn('[&_tr]:border-b', className)} {...props} />;
}

function TableBody({ class: className, ...props }: ComponentProps<'tbody'>): preact.JSX.Element {
  return <tbody data-slot='table-body' class={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

function TableFooter({ class: className, ...props }: ComponentProps<'tfoot'>): preact.JSX.Element {
  return (
    <tfoot
      data-slot='table-footer'
      class={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
      {...props}
    />
  );
}

function TableRow({ class: className, ...props }: ComponentProps<'tr'>): preact.JSX.Element {
  return (
    <tr
      data-slot='table-row'
      class={cn('border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted', className)}
      {...props}
    />
  );
}

function TableHead({ class: className, ...props }: ComponentProps<'th'>): preact.JSX.Element {
  return (
    <th
      data-slot='table-head'
      class={cn(
        'h-10 whitespace-nowrap px-2 text-left align-middle font-medium text-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ class: className, ...props }: ComponentProps<'td'>): preact.JSX.Element {
  return (
    <td
      data-slot='table-cell'
      class={cn(
        'whitespace-nowrap p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({ class: className, ...props }: ComponentProps<'caption'>): preact.JSX.Element {
  return <caption data-slot='table-caption' class={cn('mt-4 text-muted-foreground text-sm', className)} {...props} />;
}

export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow };
