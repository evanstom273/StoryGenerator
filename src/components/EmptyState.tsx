import type { ReactNode } from "react";
import { Panel } from "./ui/Panel";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <Panel className="border-dashed border-divider/[0.5] text-center">
      <div className="mx-auto max-w-xl">
        <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-ink-muted/[0.5]">
          Nothing here yet
        </div>
        <h2 className="mt-4 text-lg font-semibold text-ink">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">{description}</p>
        {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
      </div>
    </Panel>
  );
}
