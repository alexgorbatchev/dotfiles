import { cva, type VariantProps } from "class-variance-authority";
import { cloneElement, isValidElement, type ComponentChildren, type JSX, type VNode } from "preact";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
  'inline-flex min-w-0 max-w-full flex-wrap items-center justify-center gap-2 whitespace-normal rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive cursor-pointer',
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-11 sm:min-h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "min-h-11 sm:min-h-6 rounded-md gap-1 px-2.5 py-1 text-sm font-semibold has-[>svg]:px-2",
        sm: "min-h-11 sm:min-h-8 rounded-md gap-1.5 px-3 py-1.5 has-[>svg]:px-2.5",
        lg: "min-h-11 rounded-md px-6 py-2 has-[>svg]:px-4",
        icon: "size-11 sm:size-9",
        "icon-sm": "size-11 sm:size-8",
        "icon-lg": "size-11 sm:size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type SlottedElementProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  href?: string;
  "data-testid"?: string;
  "data-slot"?: string;
};

type ButtonProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "children"> &
  VariantProps<typeof buttonVariants> &
  ({ asChild: true; children: VNode<SlottedElementProps> } | { asChild?: false; children?: ComponentChildren });

interface ISlottedButtonProps {
  child: VNode<SlottedElementProps>;
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement>;
}

function SlottedButton({ child, props }: ISlottedButtonProps): JSX.Element {
  if (!isValidElement(child)) {
    throw new Error("Button asChild requires exactly one element");
  }
  const childClick = child.props.onClick;
  const buttonClick = props.onClick;
  return cloneElement(child, {
    "data-testid": "Button",
    "data-slot": "button",
    ...props,
    ...child.props,
    class: cn(props.class, child.props.class),
    "aria-disabled": props.disabled || child.props["aria-disabled"],
    ...(props.disabled && child.type === "a" ? { href: undefined } : {}),
    tabIndex: props.disabled ? -1 : (child.props.tabIndex ?? props.tabIndex),
    onClick: (event: JSX.TargetedMouseEvent<HTMLButtonElement>) => {
      if (props.disabled) {
        event.preventDefault();
        return;
      }
      childClick?.(event);
      if (!event.defaultPrevented) buttonClick?.(event);
    },
  });
}

export function Button({ class: className, variant, size, asChild, children, ...props }: ButtonProps): JSX.Element {
  const classes = cn(buttonVariants({ variant, size, className }));
  if (asChild) {
    return <SlottedButton child={children} props={{ ...props, class: classes }} />;
  }

  return (
    <button type="button" data-testid="Button" data-slot="button" class={classes} {...props}>
      {children}
    </button>
  );
}
