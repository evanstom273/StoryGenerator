import { useEffect, useId, useRef, useState } from "react";
import { cn } from "../../utils/cn";

export function HelpBubble({
	text,
	label = "Help",
	className,
}: {
	text: string;
	label?: string;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const panelId = useId();

	useEffect(() => {
		if (!open) {
			return;
		}

		function handlePointerDown(event: PointerEvent) {
			if (!containerRef.current?.contains(event.target as Node)) {
				setOpen(false);
			}
		}

		document.addEventListener("pointerdown", handlePointerDown);
		return () => document.removeEventListener("pointerdown", handlePointerDown);
	}, [open]);

	return (
		<div ref={containerRef} className={cn("relative inline-flex shrink-0", className)}>
			<button
				type="button"
				className="flex h-4 w-4 items-center justify-center rounded-full border border-divider/80 bg-panel-muted/70 text-[10px] font-bold leading-none text-ink-muted transition hover:border-accent/40 hover:bg-accent/10 hover:text-ink-soft"
				aria-label={label}
				aria-expanded={open}
				aria-controls={panelId}
				onClick={() => setOpen((current) => !current)}
			>
				?
			</button>
			{open ? (
				<div
					id={panelId}
					role="tooltip"
					className="absolute right-0 top-[calc(100%+6px)] z-[80] w-56 rounded-[8px] border border-divider bg-panel p-2.5 text-[11px] leading-relaxed text-ink-soft shadow-lg sm:w-64"
				>
					{text}
				</div>
			) : null}
		</div>
	);
}
