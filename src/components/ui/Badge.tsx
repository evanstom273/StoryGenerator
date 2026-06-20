import type { HTMLAttributes } from "react";
import { cn } from "../../utils/cn";

type BadgeVariant = "neutral" | "accent" | "success" | "warning" | "danger";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({
  variant = "neutral",
  className,
  ...props
}: BadgeProps) {
  const variants: Record<BadgeVariant, string> = {
    neutral: "border-divider bg-panel text-ink-muted",
    accent:
      "border-accent/[0.24] bg-accent/[0.12] text-accent-soft",
    success: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
    warning: "border-amber-400/20 bg-amber-400/10 text-amber-200",
    danger: "border-rose-400/20 bg-rose-400/10 text-rose-200",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-0.5 text-[11px] font-semibold tracking-wide",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
