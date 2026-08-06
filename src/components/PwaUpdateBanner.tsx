import { useEffect, useState } from "react";
import { Button } from "./ui/Button";
import { APP_NAME, APP_VERSION } from "../app/versioning/version";
import { getPendingPwaUpdate } from "../lib/pwaRegistration";
import { cn } from "../utils/cn";

export function PwaUpdateBanner({ className }: { className?: string }) {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		function handleUpdateAvailable() {
			setVisible(true);
		}

		window.addEventListener("story-engine:pwa-update-available", handleUpdateAvailable);
		return () => window.removeEventListener("story-engine:pwa-update-available", handleUpdateAvailable);
	}, []);

	if (!visible) {
		return null;
	}

	return (
		<div
			className={cn(
				"mb-6 flex flex-col gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
				className,
			)}
		>
			<div className="min-w-0">
				<p className="text-sm font-semibold text-emerald-100">Update available</p>
				<p className="mt-0.5 text-sm text-emerald-100/80">
					A new version of {APP_NAME} (v{APP_VERSION}) is ready. Reload to get the latest features and fixes.
				</p>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<Button
					size="sm"
					onClick={() => {
						const apply = getPendingPwaUpdate();
						if (apply) {
							apply();
							return;
						}
						window.location.reload();
					}}
				>
					Update now
				</Button>
				<Button variant="secondary" size="sm" onClick={() => setVisible(false)}>
					Later
				</Button>
			</div>
		</div>
	);
}
