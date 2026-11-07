import { Button } from "./ui/Button";
import { APP_NAME } from "../app/versioning/version";
import { usePwaInstall } from "../lib/usePwaInstall";
import { cn } from "../utils/cn";

export function PwaInstallBanner({ className }: { className?: string }) {
	const { mode, visible, install, dismiss } = usePwaInstall();

	if (!visible) return null;

	return (
		<div
			className={cn(
				"mb-6 flex flex-col gap-3 rounded-2xl border border-accent/25 bg-accent-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
				className,
			)}
		>
			<div className="flex min-w-0 items-start gap-3">
				<img
					src="/pwa-192x192.png"
					alt=""
					className="h-11 w-11 shrink-0 rounded-xl border border-white/10"
				/>
				<div className="min-w-0">
					<p className="text-sm font-semibold text-ink">Install {APP_NAME}</p>
					<p className="mt-0.5 text-sm text-ink-muted">
						{mode === "prompt"
							? "Add to your home screen for app-like access and automatic updates when you open it."
							: "On iPhone: tap Share, then Add to Home Screen for a full-screen app experience."}
					</p>
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-2 sm:pl-2">
				{mode === "prompt" ? (
					<Button size="sm" onClick={() => void install()}>
						Install app
					</Button>
				) : null}
				<Button variant="secondary" size="sm" onClick={dismiss}>
					Not now
				</Button>
			</div>
		</div>
	);
}
