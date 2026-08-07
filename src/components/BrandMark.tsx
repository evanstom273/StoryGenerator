import { Link } from "react-router-dom";
import { BrandLogo } from "./BrandLogo";
import { cn } from "../utils/cn";
import { APP_VERSION } from "../app/versioning/version";

interface BrandMarkProps {
  compact?: boolean;
  iconOnly?: boolean;
  mobileHeader?: boolean;
  className?: string;
}

export function BrandMark({
  compact = false,
  iconOnly = false,
  mobileHeader = false,
  className,
}: BrandMarkProps) {
  if (iconOnly) {
    return (
      <Link
        to="/"
        aria-label="Go to Home"
        className={cn("flex shrink-0 items-center", className)}
      >
        <BrandLogo className="h-9 w-9" />
      </Link>
    );
  }

  if (mobileHeader) {
    return (
      <Link
        to="/"
        aria-label="Go to Home"
        className={cn("flex shrink-0 items-center gap-2", className)}
      >
        <BrandLogo className="h-8 w-8 shrink-0" />
        <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[10px] tracking-[0.12em] text-ink-muted">
          v{APP_VERSION}
        </span>
      </Link>
    );
  }

  return (
    <Link to="/" aria-label="Go to Home" className={cn("flex items-center gap-4", className)}>
      <BrandLogo className="h-12 w-12" />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-lg font-semibold tracking-tight text-ink">
            Story Engine
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] tracking-[0.18em] text-ink-muted">
            v{APP_VERSION}
          </span>
        </div>
        {!compact ? (
          <p className="mt-1 text-sm text-ink-muted">
            Create stories inside living fictional worlds.
          </p>
        ) : null}
      </div>
    </Link>
  );
}
