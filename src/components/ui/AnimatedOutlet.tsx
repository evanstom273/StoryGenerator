import { Outlet, useLocation } from "react-router-dom";
import { usePrefersReducedMotion } from "../../app/ui/motion";
import { cn } from "../../utils/cn";

export function AnimatedOutlet() {
	const location = useLocation();
	const reducedMotion = usePrefersReducedMotion();

	return (
		<div className="relative min-h-full bg-app">
			<div
				key={location.pathname}
				className={cn(
					"min-h-full transform-gpu backface-hidden",
					reducedMotion ? undefined : "animate-page-enter",
				)}
			>
				<Outlet />
			</div>
		</div>
	);
}
