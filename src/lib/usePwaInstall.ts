import { useCallback, useEffect, useState } from "react";
import {
	type BeforeInstallPromptEvent,
	isIosWebInstallable,
	isNativeCapacitorApp,
	isPwaStandalone,
	readPwaInstallDismissed,
	writePwaInstallDismissed,
} from "../lib/pwaInstall";

export type PwaInstallMode = "prompt" | "ios" | null;

export function usePwaInstall() {
	const [mode, setMode] = useState<PwaInstallMode>(null);
	const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
	const [dismissed, setDismissed] = useState(() => readPwaInstallDismissed());

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			if (await isNativeCapacitorApp()) return;
			if (isPwaStandalone()) return;
			if (readPwaInstallDismissed()) return;

			if (!cancelled && isIosWebInstallable()) {
				setMode("ios");
			}
		})();

		function onBeforeInstallPrompt(event: Event) {
			event.preventDefault();
			if (cancelled || readPwaInstallDismissed()) return;
			setInstallPrompt(event as BeforeInstallPromptEvent);
			setMode("prompt");
		}

		function onAppInstalled() {
			setMode(null);
			setInstallPrompt(null);
		}

		window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
		window.addEventListener("appinstalled", onAppInstalled);

		return () => {
			cancelled = true;
			window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
			window.removeEventListener("appinstalled", onAppInstalled);
		};
	}, []);

	const dismiss = useCallback(() => {
		writePwaInstallDismissed(true);
		setDismissed(true);
		setMode(null);
		setInstallPrompt(null);
	}, []);

	const install = useCallback(async () => {
		if (!installPrompt) return;
		await installPrompt.prompt();
		const choice = await installPrompt.userChoice;
		setInstallPrompt(null);
		if (choice.outcome === "accepted") {
			setMode(null);
		}
	}, [installPrompt]);

	const visible = !dismissed && mode !== null && !isPwaStandalone();

	return {
		mode,
		visible,
		install,
		dismiss,
	};
}
