import { Button } from "../../components/ui/Button";
import { Panel } from "../../components/ui/Panel";
import { cn } from "../../utils/cn";
import { APP_NAME } from "./version";

export function WelcomeModal({
	open,
	onClose,
	onOpenTutorial,
}: {
	open: boolean;
	onClose: () => void;
	onOpenTutorial: () => void;
}) {
	return (
		<div
			className={cn("fixed inset-0 z-[75]", open ? "pointer-events-auto" : "pointer-events-none")}
			aria-hidden={!open}
		>
			<button
				type="button"
				aria-label="Close welcome"
				className={cn(
					"absolute inset-0 bg-slate-950/65 backdrop-blur-sm transition-opacity duration-200",
					open ? "opacity-100" : "opacity-0",
				)}
				onClick={onClose}
			/>
			<div
				className={cn(
					"absolute inset-0 flex items-center justify-center p-4 transition-opacity duration-200",
					open ? "opacity-100" : "opacity-0",
				)}
			>
				<div className="w-full max-w-md">
					<Panel variant="flat" padding="lg" role="dialog" aria-modal="true">
						<div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
							Welcome
						</div>
						<div className="mt-3 text-2xl font-semibold tracking-tight text-ink">
							Welcome to {APP_NAME}
						</div>
						<p className="mt-3 text-sm leading-7 text-ink-muted">
							Build universes, play through AI-assisted stories, and keep everything on your device. Open the
							tutorial anytime from Settings if you want a walkthrough.
						</p>
						<div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
							<Button variant="secondary" onClick={onClose}>
								Close
							</Button>
							<Button onClick={onOpenTutorial}>Tutorial</Button>
						</div>
					</Panel>
				</div>
			</div>
		</div>
	);
}
