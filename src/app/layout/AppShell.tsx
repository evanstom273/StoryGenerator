import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { BrandMark } from "../../components/BrandMark";
import { MenuIcon } from "../../components/icons";
import { Button } from "../../components/ui/Button";

export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-app text-ink">
      <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="hidden w-80 shrink-0 lg:block">
          <div className="sticky top-0 h-screen border-r border-white/8 px-6 py-6">
            <Sidebar />
          </div>
        </aside>
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/8 bg-app/80 px-4 py-4 backdrop-blur-xl sm:px-6 lg:hidden">
            <BrandMark compact />
            <Button
              variant="secondary"
              size="sm"
              className="rounded-full"
              aria-label="Open navigation"
              onClick={() => setMobileNavOpen(true)}
            >
              <MenuIcon />
            </Button>
          </header>
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
            <div className="mx-auto max-w-7xl">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
