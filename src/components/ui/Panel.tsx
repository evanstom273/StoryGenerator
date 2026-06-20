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
        "rounded-xl border border-divider/[0.7] bg-panel",
        paddings[padding],
        className,
      )}
      {...props}
    />
  );
}
