import type { ReactNode } from "react";
import { cn } from "../utils/cn";

interface PageHeaderProps {
  title: string;
  description: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-5 border-b border-divider/[0.5] pb-6 md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className="max-w-3xl">
        {eyebrow ? (
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-[32px] font-extrabold leading-tight tracking-[-0.03em] text-ink md:text-[40px]">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-muted md:text-base">
          {description}
        </p>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
