import type { HTMLAttributes } from "react";
import { cn } from "../../utils/cn";

type PanelPadding = "none" | "sm" | "md" | "lg";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  padding?: PanelPadding;
}

export function Panel({
  padding = "md",
  className,
  ...props
}: PanelProps) {
  const paddings: Record<PanelPadding, string> = {
    none: "",
    sm: "p-4",
    md: "p-6",
    lg: "p-8",
  };

  return (
    <div
      className={cn(
        "rounded-card border border-divider bg-panel shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_42px_rgb(var(--theme-primary-rgb)/0.06)] backdrop-blur-xl ring-1 ring-accent/10",
        paddings[padding],
        className,
      )}
      {...props}
    />
  );
}
