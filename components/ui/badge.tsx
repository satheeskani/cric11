import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "border-transparent bg-muted text-muted-foreground",
        bat: "border-transparent bg-role-bat/15 text-role-bat",
        bowl: "border-transparent bg-role-bowl/15 text-role-bowl",
        ar: "border-transparent bg-role-ar/15 text-role-ar",
        wk: "border-transparent bg-role-wk/15 text-role-wk",
        accent: "border-transparent bg-accent/15 text-accent",
        outline: "border-border text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
