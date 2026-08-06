import { useEffect, useState } from "react";

export const MOTION_DURATION_MS = 180;
export const MOTION_DURATION_CLASS = "duration-[180ms]";
export const MOTION_EASE_CLASS = "ease-out";

export const OVERLAY_BACKDROP_CLASS =
	"transition-opacity duration-[180ms] ease-out bg-app/80 backdrop-blur-sm";

export const DRAWER_PANEL_CLASS = "transition-transform duration-[180ms] ease-out";

export const BOTTOM_SHEET_PANEL_CLASS = "transition-transform duration-[180ms] ease-out";

export const MODAL_PANEL_CLASS =
	"transition-[opacity,transform] duration-[180ms] ease-out";

export function usePrefersReducedMotion(): boolean {
	const [reducedMotion, setReducedMotion] = useState(false);

	useEffect(() => {
		const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
		const update = () => setReducedMotion(mediaQuery.matches);
		update();
		mediaQuery.addEventListener("change", update);
		return () => mediaQuery.removeEventListener("change", update);
	}, []);

	return reducedMotion;
}
