import { cva, type VariantProps } from "class-variance-authority";
import { type ComponentChildren, type JSX } from "preact";

import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "text-foreground",
        success:
          "bg-green-100 text-green-900 border-green-300 dark:bg-green-950 dark:text-green-200 dark:border-green-800",
        warning:
          "bg-amber-100 text-amber-950 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
        error: "bg-red-100 text-red-900 border-red-300 dark:bg-red-950 dark:text-red-200 dark:border-red-800",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type BadgeProps = JSX.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof badgeVariants> & {
    children?: ComponentChildren;
  };

export function Badge({ class: className, variant, ...props }: BadgeProps): JSX.Element {
  return <div data-testid="Badge" class={cn(badgeVariants({ variant }), className)} {...props} />;
}
