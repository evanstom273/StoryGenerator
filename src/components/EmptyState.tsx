import type { ReactNode } from "react";
import { Panel } from "./ui/Panel";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <Panel variant="flat" className="border-dashed border-white/12 text-center">
      <div className="mx-auto max-w-xl">
        <h2 className="text-xl font-semibold tracking-tight text-ink">{title}</h2>
        <p className="mt-3 text-sm leading-7 text-ink-muted">{description}</p>
        {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
      </div>
    </Panel>
  );
}

