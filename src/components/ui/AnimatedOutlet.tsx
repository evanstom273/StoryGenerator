import { Outlet, useLocation } from "react-router-dom";
import { usePrefersReducedMotion } from "../../app/ui/motion";
import { cn } from "../../utils/cn";

export function AnimatedOutlet() {
	const location = useLocation();
	const reducedMotion = usePrefersReducedMotion();

	return (
		<div
			key={location.pathname}
			className={cn(reducedMotion ? undefined : "animate-page-enter")}
		>
			<Outlet />
		</div>
	);
}
