import { useEffect, useRef, useState } from "react";
import { RouterProvider } from "react-router-dom";
import { router } from "../router";
import { useStoryEngine } from "../providers/StoryEngineProvider";
import { LaunchSplash } from "./LaunchSplash";
import { SPLASH_EXIT_MS, usePrefersReducedMotion } from "../ui/motion";

const SPLASH_MIN_VISIBLE_MS = 1400;

export function AppBootstrap() {
	const { loading } = useStoryEngine();
	const reducedMotion = usePrefersReducedMotion();
	const mountAtRef = useRef(Date.now());
	const [splashVisible, setSplashVisible] = useState(true);
	const [splashExiting, setSplashExiting] = useState(false);

	useEffect(() => {
		if (loading) {
			return;
		}

		const elapsed = Date.now() - mountAtRef.current;
		const minWait = reducedMotion ? 0 : Math.max(0, SPLASH_MIN_VISIBLE_MS - elapsed);
		const fadeMs = reducedMotion ? 0 : SPLASH_EXIT_MS;

		const exitTimer = window.setTimeout(() => setSplashExiting(true), minWait);
		const hideTimer = window.setTimeout(() => setSplashVisible(false), minWait + fadeMs);

		return () => {
			window.clearTimeout(exitTimer);
			window.clearTimeout(hideTimer);
		};
	}, [loading, reducedMotion]);

	return (
		<>
			<RouterProvider router={router} />
			{splashVisible ? (
				<LaunchSplash exiting={splashExiting} reducedMotion={reducedMotion} />
			) : null}
		</>
	);
}
