import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../utils/cn";

const VIEWPORT_PADDING_PX = 12;
const PANEL_GAP_PX = 6;
const PANEL_WIDTH_PX = 256;

function clampPanelPosition(buttonRect: DOMRect, panelRect: DOMRect) {
	const maxWidth = Math.min(PANEL_WIDTH_PX, window.innerWidth - VIEWPORT_PADDING_PX * 2);

	let left = buttonRect.left + buttonRect.width / 2 - maxWidth / 2;
	left = Math.max(
		VIEWPORT_PADDING_PX,
		Math.min(left, window.innerWidth - maxWidth - VIEWPORT_PADDING_PX),
	);

	let top = buttonRect.bottom + PANEL_GAP_PX;
	if (top + panelRect.height > window.innerHeight - VIEWPORT_PADDING_PX) {
		top = buttonRect.top - panelRect.height - PANEL_GAP_PX;
	}
	top = Math.max(
		VIEWPORT_PADDING_PX,
		Math.min(top, window.innerHeight - panelRect.height - VIEWPORT_PADDING_PX),
	);

	return { left, top, width: maxWidth };
}

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
	const [panelStyle, setPanelStyle] = useState<CSSProperties>({
		position: "fixed",
		left: VIEWPORT_PADDING_PX,
		top: VIEWPORT_PADDING_PX,
		width: PANEL_WIDTH_PX,
		visibility: "hidden",
	});
	const containerRef = useRef<HTMLDivElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const panelId = useId();

	useLayoutEffect(() => {
		if (!open) {
			return;
		}

		function updatePosition() {
			const container = containerRef.current;
			const panel = panelRef.current;
			const button = container?.querySelector("button");
			if (!container || !panel || !button) {
				return;
			}

			const nextPosition = clampPanelPosition(button.getBoundingClientRect(), panel.getBoundingClientRect());
			setPanelStyle({
				position: "fixed",
				left: nextPosition.left,
				top: nextPosition.top,
				width: nextPosition.width,
				visibility: "visible",
			});
		}

		updatePosition();
		window.addEventListener("resize", updatePosition);
		window.addEventListener("scroll", updatePosition, true);
		return () => {
			window.removeEventListener("resize", updatePosition);
			window.removeEventListener("scroll", updatePosition, true);
		};
	}, [open, text]);

	useEffect(() => {
		if (!open) {
			return;
		}

		function handlePointerDown(event: PointerEvent) {
			const target = event.target as Node;
			if (containerRef.current?.contains(target) || panelRef.current?.contains(target)) {
				return;
			}
			setOpen(false);
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
			{open
				? createPortal(
						<div
							ref={panelRef}
							id={panelId}
							role="tooltip"
							style={panelStyle}
							className="z-[120] rounded-[8px] border border-divider bg-panel p-2.5 text-[11px] leading-relaxed text-ink-soft shadow-lg"
						>
							{text}
						</div>,
						document.body,
					)
				: null}
		</div>
	);
}
