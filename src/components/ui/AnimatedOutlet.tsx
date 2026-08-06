import { useEffect, useRef, useState } from "react";
import { useLocation, useOutlet } from "react-router-dom";
import { PAGE_ENTER_MS, PAGE_EXIT_MS, usePrefersReducedMotion } from "../../app/ui/motion";
import { cn } from "../../utils/cn";

export function AnimatedOutlet() {
	const location = useLocation();
	const outlet = useOutlet();
	const reducedMotion = usePrefersReducedMotion();
	const [displayedKey, setDisplayedKey] = useState(location.key);
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

		if (reducedMotion) {
			setDisplayedKey(location.key);
			setDisplayedOutlet(outlet);
			setAnimClass(null);
			return;
		}

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
	}, [location.key, outlet, displayedKey, reducedMotion]);

	return (
		<div className="relative min-h-full overflow-x-hidden bg-app">
			<div
				className={cn(
					"min-h-full backface-hidden",
					animClass !== null && "transform-gpu",
					animClass === "exit" && "animate-page-exit",
					animClass === "enter" && "animate-page-enter",
				)}
			>
				{displayedOutlet}
			</div>
		</div>
	);
}
