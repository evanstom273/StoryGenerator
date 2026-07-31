const PWA_INSTALL_DISMISSED_KEY = "story-engine:pwa-install-dismissed";

export type BeforeInstallPromptEvent = Event & {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function isPwaStandalone(): boolean {
	if (typeof window === "undefined") return false;
	return (
		window.matchMedia("(display-mode: standalone)").matches ||
		(window.navigator as Navigator & { standalone?: boolean }).standalone === true
	);
}

export function isIosWebInstallable(): boolean {
	if (typeof navigator === "undefined") return false;
	const ua = navigator.userAgent;
	return /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
}

export function readPwaInstallDismissed(): boolean {
	try {
		return localStorage.getItem(PWA_INSTALL_DISMISSED_KEY) === "1";
	} catch {
		return false;
	}
}

export function writePwaInstallDismissed(dismissed: boolean): void {
	try {
		if (dismissed) {
			localStorage.setItem(PWA_INSTALL_DISMISSED_KEY, "1");
		} else {
			localStorage.removeItem(PWA_INSTALL_DISMISSED_KEY);
		}
	} catch {
		// ignore
	}
}

export async function isNativeCapacitorApp(): Promise<boolean> {
	try {
		const { Capacitor } = await import("@capacitor/core");
		return Capacitor.isNativePlatform();
	} catch {
		return false;
	}
}
