import { CloseIcon } from "../../components/icons";
import { Button } from "../../components/ui/Button";
import { Sidebar } from "./Sidebar";
import { cn } from "../../utils/cn";

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

export function MobileNav({ open, onClose }: MobileNavProps) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 lg:hidden",
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label="Close navigation"
        className={cn(
          "absolute inset-0 bg-slate-950/65 backdrop-blur-sm transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "absolute inset-y-0 left-0 flex w-[min(88vw,24rem)] flex-col border-r border-white/10 bg-app-elevated p-4 shadow-hero transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="mb-4 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full border border-white/10 bg-white/[0.04]"
            onClick={onClose}
            aria-label="Close menu"
          >
            <CloseIcon />
          </Button>
        </div>
        <Sidebar onNavigate={onClose} />
      </div>
    </div>
  );
}
