import { useState } from "react";
import type { StoryMessage } from "../../types/models";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";
import { cn } from "../../utils/cn";

function formatGeneratedAt(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}

	return date.toLocaleString(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});
}

function formatEntryLabel(entry?: "story_history" | "workspace") {
	if (entry === "story_history") {
		return "Generated story history";
	}
	if (entry === "workspace") {
		return "Generate Chapters";
	}
	return "Guided generation";
}

export function GuidedChapterSetupModal(props: {
	open: boolean;
	onClose: () => void;
	setup: StoryMessage["guidedChapterSetup"] | null | undefined;
}) {
	if (!props.setup) {
		return null;
	}

	const setup = props.setup;

	return (
		<div
			className={cn(
				"fixed inset-0 z-[90]",
				props.open ? "pointer-events-auto" : "pointer-events-none",
			)}
			aria-hidden={!props.open}
		>
			<button
				type="button"
				aria-label="Close chapter plan"
				className={cn(
					"absolute inset-0 bg-black/60 transition-opacity",
					props.open ? "opacity-100" : "opacity-0",
				)}
				onClick={props.onClose}
			/>
			<div
				className={cn(
					"absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col overflow-hidden rounded-t-[18px] border border-divider bg-app shadow-hero transition-transform sm:inset-0 sm:mx-auto sm:my-8 sm:max-w-2xl sm:rounded-[18px]",
					props.open ? "translate-y-0" : "translate-y-full sm:translate-y-4 sm:opacity-0",
				)}
			>
				<Panel variant="flat" padding="lg" className="flex min-h-0 flex-1 flex-col overflow-hidden border-0">
					<div className="shrink-0">
						<div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
							Chapter Plan
						</div>
						<h2 className="mt-2 text-xl font-semibold text-ink">{setup.chapterLabel}</h2>
						<p className="mt-2 text-sm text-ink-muted">
							{formatEntryLabel(setup.entry)} · saved {formatGeneratedAt(setup.generatedAt)}
						</p>
					</div>

					<div className="mt-6 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
						{setup.overallDirection ? (
							<section>
								<div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">
									Overall direction
								</div>
								<p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-soft">
									{setup.overallDirection}
								</p>
							</section>
						) : null}

						<section>
							<div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">
								Chapter overview
							</div>
							<p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-soft">
								{setup.chapterOverview}
							</p>
						</section>

						<section>
							<div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">
								Scenes ({setup.scenesPerChapter})
							</div>
							<div className="mt-3 space-y-3">
								{setup.scenes.map((scene) => (
									<Panel
										key={scene.label}
										variant="flat"
										className="border border-white/8 bg-white/[0.03]"
										padding="md"
									>
										<div className="text-sm font-semibold text-ink">{scene.label}</div>
										<p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-soft">
											{scene.overview}
										</p>
									</Panel>
								))}
							</div>
						</section>
					</div>

					<div className="mt-6 flex shrink-0 justify-end">
						<Button type="button" variant="ghost" onClick={props.onClose}>
							Close
						</Button>
					</div>
				</Panel>
			</div>
		</div>
	);
}

export function ChapterPlanButton(props: {
	setup: StoryMessage["guidedChapterSetup"] | null | undefined;
	className?: string;
}) {
	const [open, setOpen] = useState(false);

	if (!props.setup) {
		return null;
	}

	return (
		<>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className={cn("normal-case tracking-normal", props.className)}
				onClick={() => setOpen(true)}
			>
				View plan
			</Button>
			<GuidedChapterSetupModal
				open={open}
				onClose={() => setOpen(false)}
				setup={props.setup}
			/>
		</>
	);
}
