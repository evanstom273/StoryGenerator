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
    sm: "px-[18px] py-[15px]",
    md: "px-[18px] py-[15px]",
    lg: "px-[18px] py-[15px]",
  };

  return (
    <div
      className={cn(
        "rounded-[10px] border border-divider/[0.7] bg-app",
        paddings[padding],
        className,
      )}
      {...props}
    />
  );
}
