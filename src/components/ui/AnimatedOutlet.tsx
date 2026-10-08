import { useEffect, useRef, useState } from "react";
import { useLocation, useOutlet } from "react-router-dom";
import { PAGE_ENTER_MS, PAGE_EXIT_MS, usePrefersReducedMotion } from "../../app/ui/motion";
import { cn } from "../../utils/cn";

export function AnimatedOutlet() {
	const location = useLocation();
	const outlet = useOutlet();
	const reducedMotion = usePrefersReducedMotion();
	const isMetaChat = location.pathname === "/metachat";
	const previousPathRef = useRef(location.pathname);
	const bypassAnimation = isMetaChat || previousPathRef.current === "/metachat";
	// A route with a different shell layout must never render the previous page, even for one frame.
	const [displayedKey, setDisplayedKey] = useState(location.key);
	const instantRouteSwap = bypassAnimation && location.key !== displayedKey;
	const [displayedOutlet, setDisplayedOutlet] = useState(outlet);
	const [animClass, setAnimClass] = useState<"enter" | "exit" | null>(null);
	const pendingOutletRef = useRef(outlet);
	const pendingKeyRef = useRef(location.key);

	pendingOutletRef.current = outlet;
	pendingKeyRef.current = location.key;

	useEffect(() => {
		if (location.key === displayedKey) {
			return;
		}

		if (reducedMotion || bypassAnimation) {
			previousPathRef.current = location.pathname;
			setDisplayedKey(location.key);
			setDisplayedOutlet(outlet);
			setAnimClass(null);
			return;
		}

		previousPathRef.current = location.pathname;
		setAnimClass("exit");

		const swapTimer = window.setTimeout(() => {
			setDisplayedKey(pendingKeyRef.current);
			setDisplayedOutlet(pendingOutletRef.current);
			setAnimClass("enter");
		}, PAGE_EXIT_MS);

		const clearTimer = window.setTimeout(() => {
			setAnimClass(null);
		}, PAGE_EXIT_MS + PAGE_ENTER_MS);

		return () => {
			window.clearTimeout(swapTimer);
			window.clearTimeout(clearTimer);
		};
	}, [location.key, location.pathname, outlet, displayedKey, reducedMotion, bypassAnimation]);

	return (
		<div className={cn("relative min-w-0 bg-app", isMetaChat ? "h-full min-h-0 overflow-hidden" : "min-h-full")}>
			<div
				className={cn(
					isMetaChat ? "h-full min-h-0 min-w-0 overflow-hidden backface-hidden" : "min-h-full min-w-0 backface-hidden",
					!instantRouteSwap && animClass === "exit" && "animate-page-exit",
					!instantRouteSwap && animClass === "enter" && "animate-page-enter",
				)}
			>
				{instantRouteSwap ? outlet : displayedOutlet}
			</div>
		</div>
	);
}
