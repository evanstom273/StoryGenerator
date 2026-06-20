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
    sm: "p-3.5",
    md: "px-[18px] py-[15px]",
    lg: "p-6",
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
