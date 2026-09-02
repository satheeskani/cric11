import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "border-transparent bg-muted text-muted-foreground",
        bat: "border-transparent bg-role-bat/15 text-role-bat font-bold uppercase tracking-wide text-[10px]",
        bowl: "border-transparent bg-role-bowl/15 text-role-bowl font-bold uppercase tracking-wide text-[10px]",
        ar: "border-transparent bg-role-ar/15 text-role-ar font-bold uppercase tracking-wide text-[10px]",
        wk: "border-transparent bg-role-wk/15 text-role-wk font-bold uppercase tracking-wide text-[10px]",
        accent: "border-transparent bg-accent/15 text-accent",
        outline: "border-border text-foreground",
        /* Broadcast "flag" badges — rectangular, not pill-shaped, matching
         * the team-sheet graphic device used across the Suggested XI. */
        captain: "rounded-[3px] border-transparent bg-primary text-primary-foreground font-extrabold uppercase tracking-wide text-[10px] px-1.5 py-0.5",
        vice: "rounded-[3px] border border-accent bg-transparent text-accent font-extrabold uppercase tracking-wide text-[10px] px-1.5 py-0.5",
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
