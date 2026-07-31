/**
 * Registers the PWA service worker on web only. Capacitor APK builds load bundled
 * assets locally and should not compete with Workbox auto-updates.
 */
export async function registerPwaServiceWorker(): Promise<void> {
	if (typeof window === "undefined") return;

	try {
		const { Capacitor } = await import("@capacitor/core");
		if (Capacitor.isNativePlatform()) return;
	} catch {
		// Capacitor not available in pure web dev — continue with registration.
	}

	const { registerSW } = await import("virtual:pwa-register");
	registerSW({ immediate: true });
}
