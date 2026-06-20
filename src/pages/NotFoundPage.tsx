import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { buttonClasses } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";

export function NotFoundPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Missing route"
        title="That page doesn’t exist in this shell"
        description="Use the navigation to jump back into the Story Engine workspace."
      />
      <Panel className="max-w-xl">
        <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-ink-muted/[0.5]">
          Route Not Found
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          The requested route is outside the current Version 1 scope.
        </p>
        <Link to="/" className={buttonClasses({ variant: "primary", className: "mt-6" })}>
          Return home
        </Link>
      </Panel>
    </div>
  );
}
