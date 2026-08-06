import { APP_VERSION } from "../versioning/version";
import { BrandLogo } from "../../components/BrandLogo";
import { cn } from "../../utils/cn";

export function LaunchSplash({
	exiting,
	reducedMotion,
}: {
	exiting: boolean;
	reducedMotion: boolean;
}) {
	return (
		<div
			className={cn(
				"fixed inset-0 z-[200] flex flex-col items-center justify-center bg-app px-6",
				reducedMotion ? "transition-none" : "transition-opacity duration-[180ms] ease-out",
				exiting ? "pointer-events-none opacity-0" : "opacity-100",
				!exiting && !reducedMotion ? "animate-splash-enter" : null,
			)}
			role="status"
			aria-live="polite"
			aria-label="Loading Story Engine"
		>
			<BrandLogo className="h-20 w-20 animate-splash-logo" />
			<div className="mt-6 text-center">
				<div className="text-xl font-semibold tracking-tight text-ink">Story Engine</div>
				<div className="mt-1 text-xs tracking-[0.18em] text-ink-muted">v{APP_VERSION}</div>
			</div>
			<div className="mt-8 text-xs text-ink-muted/80">Loading...</div>
		</div>
	);
}
