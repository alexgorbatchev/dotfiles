import { cva, type VariantProps } from 'class-variance-authority';
import { type ComponentChildren, type JSX } from 'preact';

import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80',
        outline: 'text-foreground',
        success: 'border-transparent bg-green-500/20 text-green-500 border-green-500/30',
        warning: 'border-transparent bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        error: 'border-transparent bg-red-500/20 text-red-400 border-red-500/30',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

type BadgeProps =
  & JSX.HTMLAttributes<HTMLDivElement>
  & VariantProps<typeof badgeVariants>
  & {
    children?: ComponentChildren;
  };

function Badge({ class: className, variant, ...props }: BadgeProps): JSX.Element {
  return <div class={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
