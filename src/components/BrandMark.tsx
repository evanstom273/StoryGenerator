import { cn } from "../utils/cn";

interface BrandMarkProps {
  compact?: boolean;
  className?: string;
}

export function BrandMark({ compact = false, className }: BrandMarkProps) {
  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-white/12 bg-gradient-to-br from-accent/30 via-cyan-400/12 to-white/8 shadow-[0_18px_40px_rgba(56,189,248,0.15)]">
        <svg
          aria-hidden="true"
          viewBox="0 0 48 48"
          className="h-8 w-8 text-white"
          fill="none"
        >
          <circle cx="24" cy="24" r="4.5" fill="currentColor" />
          <path
            d="M8 24c4.2-5.4 9.9-8 16-8s11.8 2.6 16 8c-4.2 5.4-9.9 8-16 8S12.2 29.4 8 24Z"
            stroke="currentColor"
            strokeOpacity="0.92"
            strokeWidth="2"
          />
          <path
            d="M24 8c5.4 4.2 8 9.9 8 16s-2.6 11.8-8 16c-5.4-4.2-8-9.9-8-16s2.6-11.8 8-16Z"
            stroke="currentColor"
            strokeOpacity="0.72"
            strokeWidth="2"
          />
        </svg>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-lg font-semibold tracking-tight text-ink">
            Story Engine
          </span>
          {!compact ? (
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] text-ink-muted">
              v1
            </span>
          ) : null}
        </div>
        {!compact ? (
          <p className="mt-1 text-sm text-ink-muted">
            Create stories inside living fictional worlds.
          </p>
        ) : null}
      </div>
    </div>
  );
}
