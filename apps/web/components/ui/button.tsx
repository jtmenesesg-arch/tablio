import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex min-h-touch items-center justify-center gap-2 whitespace-nowrap rounded-button border border-transparent px-6 py-3 text-small font-bold transition-[background-color,color,border-color,opacity,transform] duration-[var(--motion-feedback)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:size-icon [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground hover:bg-primary-hover active:translate-y-px",
        secondary:
          "bg-secondary text-secondary-foreground hover:opacity-90 active:translate-y-px",
        outline:
          "border-border bg-card text-card-foreground hover:bg-muted active:translate-y-px",
        ghost:
          "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
        destructive:
          "bg-destructive text-destructive-foreground hover:opacity-90 active:translate-y-px",
      },
      size: {
        default: "",
        small: "rounded-button-sm px-4 py-2",
        icon: "size-touch rounded-button p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild = false, className, size, variant, ...props }, ref) => {
    const Component = asChild ? Slot : "button";
    return (
      <Component
        className={cn(buttonVariants({ className, size, variant }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
