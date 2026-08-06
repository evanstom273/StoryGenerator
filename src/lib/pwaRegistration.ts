/**
 * Registers the PWA service worker on web only. Capacitor APK builds load bundled
 * assets locally and should not compete with Workbox auto-updates.
 */
let applyPendingPwaUpdate: (() => void) | undefined;

export function getPendingPwaUpdate(): (() => void) | undefined {
	return applyPendingPwaUpdate;
}

export async function registerPwaServiceWorker(): Promise<void> {
	if (typeof window === "undefined") return;

	try {
		const { Capacitor } = await import("@capacitor/core");
		if (Capacitor.isNativePlatform()) return;
	} catch {
		// Capacitor not available in pure web dev — continue with registration.
	}

	const { registerSW } = await import("virtual:pwa-register");
	const updateSW = registerSW({
		immediate: true,
		onNeedRefresh() {
			applyPendingPwaUpdate = () => {
				void updateSW(true);
			};
			window.dispatchEvent(new Event("story-engine:pwa-update-available"));
		},
		onOfflineReady() {
			window.dispatchEvent(new Event("story-engine:pwa-offline-ready"));
		},
	});
}
