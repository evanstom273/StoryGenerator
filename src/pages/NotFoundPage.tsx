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
        <p className="text-sm leading-7 text-ink-muted">
          The requested route is outside the current Version 1 scope.
        </p>
        <Link to="/" className={buttonClasses({ variant: "primary", className: "mt-6" })}>
          Return home
        </Link>
      </Panel>
    </div>
  );
}
