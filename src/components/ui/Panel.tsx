import type { HTMLAttributes } from "react";
import { cn } from "../../utils/cn";

type PanelPadding = "none" | "sm" | "md" | "lg";
type PanelVariant = "default" | "flat";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  padding?: PanelPadding;
  variant?: PanelVariant;
}

export function Panel({
  padding = "md",
  variant = "default",
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
        paddings[padding],
        variant === "flat"
          ? "rounded-[10px] border border-divider/[0.35] bg-app-elevated"
          : "rounded-card border border-divider bg-panel shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_42px_rgb(var(--accent-rgb)/0.06)] backdrop-blur-xl ring-1 ring-accent/10",
        className,
      )}
      {...props}
    />
  );
}
