import { useEffect, useState } from "react";

export const MOTION_DURATION_MS = 320;
export const MOTION_DURATION_CLASS = "duration-[320ms]";
export const MOTION_EASE_CLASS = "ease-out";

export const PAGE_TRANSITION_MS = 580;
export const PAGE_EXIT_MS = 240;
export const PAGE_ENTER_MS = PAGE_TRANSITION_MS;
export const PAGE_TRANSITION_CLASS = "duration-[580ms]";

export const SPLASH_EXIT_MS = 450;
export const SPLASH_EXIT_CLASS = "duration-[450ms]";

export const OVERLAY_BACKDROP_CLASS =
	"transition-opacity duration-[320ms] ease-out bg-app/80 backdrop-blur-sm";

export const DRAWER_PANEL_CLASS = "transition-transform duration-[320ms] ease-out";

export const BOTTOM_SHEET_PANEL_CLASS = "transition-transform duration-[320ms] ease-out";

export const MODAL_PANEL_CLASS =
	"transition-[opacity,transform] duration-[320ms] ease-out";

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
