import { NavLink } from "react-router-dom";
import { BrandMark } from "../../components/BrandMark";
import { LayersIcon, MemoryIcon, OrbitIcon } from "../../components/icons";
import { navigationItems } from "../navigation";
import { cn } from "../../utils/cn";

interface SidebarProps {
  className?: string;
  onNavigate?: () => void;
}

export function Sidebar({ className, onNavigate }: SidebarProps) {
  return (
    <div className={cn("flex h-full flex-col gap-6", className)}>
      <BrandMark compact />
      <nav className="space-y-2" aria-label="Primary">
        {navigationItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "group flex items-start gap-3 rounded-card border px-4 py-4 transition duration-200",
                  isActive
                    ? "border-accent/20 bg-accent/12 text-ink shadow-[0_18px_50px_rgba(139,92,246,0.18)]"
                    : "border-transparent bg-transparent text-ink-muted hover:border-white/10 hover:bg-white/[0.05] hover:text-ink-soft",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={cn(
                      "mt-0.5 rounded-2xl p-2 transition",
                      isActive
                        ? "bg-accent/15 text-accent-soft"
                        : "bg-white/[0.04] text-ink-muted group-hover:text-ink-soft",
                    )}
                  >
                    <Icon />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium">{item.label}</div>
                    <div className="mt-1 text-sm leading-6 text-ink-muted group-hover:text-ink-muted">
                      {item.description}
                    </div>
                  </div>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
      <div className="mt-auto rounded-shell border border-white/10 bg-white/[0.04] p-5 shadow-panel">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-soft">
          Story workspace
        </div>
        <div className="mt-4 space-y-4 text-sm text-ink-muted">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-accent/12 p-2 text-accent-soft">
              <MemoryIcon />
            </div>
            <span>Persistent local story history</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-accent/12 p-2 text-accent-soft">
              <OrbitIcon />
            </div>
            <span>Dynamic canon-character participation</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-accent/12 p-2 text-accent-soft">
              <LayersIcon />
            </div>
            <span>Universe imports and full story export</span>
          </div>
        </div>
      </div>
    </div>
  );
}
