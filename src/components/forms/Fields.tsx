import type {
  InputHTMLAttributes,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EntityId, Universe } from "../../types/models";
import { normalizePlayerCharacterAliases, normalizePlayerCharacterKnownTies } from "../../lib/playerCharacterPrompt";
import { cn } from "../../utils/cn";
import { HelpBubble } from "../ui/HelpBubble";

export function Field({
  label,
  hint,
  help,
  action,
  children,
}: {
  label: string;
  hint?: string;
  help?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink-soft">
          {label}
          {help ? <HelpBubble text={help} label={`Help: ${label}`} /> : null}
        </span>
        <div className="flex items-center gap-2">
          {hint ? <span className="text-[11px] text-ink-muted">{hint}</span> : null}
          {action}
        </div>
      </div>
      {children}
    </label>
  );
}

export const inputClasses =
  "w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent/[0.4] focus:ring-2 focus:ring-accent/[0.15]";

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClasses, className)} {...props} />;
}

export function SelectInput({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputClasses, className)} {...props}>
      {children}
    </select>
  );
}

type TextAreaInputProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  defaultHeightPx?: number;
  minHeightPx?: number;
  maxHeightPx?: number;
  snapThresholdPx?: number;
};

export function TextAreaInput({
  className,
  style,
  defaultHeightPx = 180,
  minHeightPx = 160,
  maxHeightPx = 420,
  snapThresholdPx = 28,
  onMouseUp,
  onTouchEnd,
  ...props
}: TextAreaInputProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [height, setHeight] = useState(defaultHeightPx);
  const dragStateRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
  } | null>(null);

  useEffect(() => {
    setHeight((current) =>
      Math.max(minHeightPx, Math.min(maxHeightPx, current || defaultHeightPx)),
    );
  }, [defaultHeightPx, minHeightPx, maxHeightPx]);

  function resolveHeight(nextHeight: number) {
    const clampedHeight = Math.max(minHeightPx, Math.min(maxHeightPx, nextHeight));
    return Math.abs(clampedHeight - defaultHeightPx) <= snapThresholdPx
      ? defaultHeightPx
      : clampedHeight;
  }

  function snapHeightIfNeeded() {
    const element = ref.current;
    if (!element) {
      return;
    }

    setHeight(resolveHeight(element.offsetHeight));
  }

  function endDrag() {
    dragStateRef.current = null;
    snapHeightIfNeeded();
  }

  function handleResizePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    dragStateRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handleResizePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const delta = event.clientY - dragState.startY;
    setHeight(resolveHeight(dragState.startHeight + delta));
  }

  function handleResizePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    if (dragStateRef.current?.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);
    endDrag();
  }

  return (
    <div className="space-y-2">
      <textarea
        ref={ref}
        className={cn(inputClasses, "resize-none overflow-y-auto", className)}
        style={{
          ...style,
          height: `${height}px`,
          minHeight: `${minHeightPx}px`,
          maxHeight: `${maxHeightPx}px`,
        }}
        onMouseUp={(event) => {
          onMouseUp?.(event);
        }}
        onTouchEnd={(event) => {
          onTouchEnd?.(event);
        }}
        {...props}
      />
      <button
        type="button"
        aria-label="Resize text area"
        disabled={props.disabled || props.readOnly}
        className="group flex w-full touch-none items-center justify-center rounded-[8px] border border-divider/[0.45] bg-panel-muted/40 px-3 py-2 text-[11px] font-medium text-ink-muted transition hover:border-accent/[0.35] hover:text-ink-soft disabled:cursor-not-allowed disabled:opacity-45"
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        onPointerCancel={endDrag}
      >
        <span className="mr-3 h-1.5 w-10 rounded-full bg-divider/80 transition group-hover:bg-accent/50" />
        Drag to resize
        <span className="ml-3 h-1.5 w-10 rounded-full bg-divider/80 transition group-hover:bg-accent/50" />
      </button>
    </div>
  );
}

export function MultiUniversePicker({
  universes,
  selectedIds,
  onChange,
  disabled,
}: {
  universes: Universe[];
  selectedIds: EntityId[];
  onChange: (ids: EntityId[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const summary = useMemo(() => {
    if (!selectedIds.length) {
      return "Select universes";
    }

    const names = selectedIds
      .map((id) => universes.find((universe) => universe.id === id)?.name)
      .filter((name): name is string => Boolean(name));

    if (names.length === 1) {
      return names[0];
    }

    if (names.length === 2) {
      return names.join(", ");
    }

    return `${names.length} universes selected`;
  }, [selectedIds, universes]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        className={cn(
          inputClasses,
          "flex items-center justify-between gap-3 text-left",
          disabled && "opacity-60",
        )}
        onClick={() => {
          if (!disabled) {
            setOpen((current) => !current);
          }
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={cn(!selectedIds.length && "text-ink-muted")}>{summary}</span>
        <span className="shrink-0 text-xs text-ink-muted">{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
        <div
          className="absolute z-50 mt-1 w-full rounded-[8px] border border-divider bg-panel shadow-lg"
          role="listbox"
        >
          <div className="max-h-56 space-y-1 overflow-y-auto p-2">
            {universes.map((universe) => {
              const checked = selectedIds.includes(universe.id);
              return (
                <label
                  key={universe.id}
                  className={cn(
                    "flex items-center gap-3 rounded-[6px] px-2.5 py-2 text-sm transition",
                    checked ? "bg-accent/[0.08] text-ink" : "text-ink-soft hover:bg-panel-muted/80",
                    disabled ? "opacity-60" : "cursor-pointer",
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-4 rounded border-divider text-accent focus:ring-accent/[0.25]"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => {
                      if (checked) {
                        onChange(selectedIds.filter((id) => id !== universe.id));
                        return;
                      }
                      onChange([...selectedIds, universe.id]);
                    }}
                  />
                  <span className="font-medium">{universe.name}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AliasesInput({
	value,
	onChange,
	placeholder = "Alex, Rivera, Detective Rivera…",
	disabled,
}: {
	value: string[];
	onChange: (next: string[]) => void;
	placeholder?: string;
	disabled?: boolean;
}) {
	const [draft, setDraft] = useState("");

	function addAlias(raw: string) {
		const trimmed = raw.trim();
		if (!trimmed) {
			return;
		}

		const next = normalizePlayerCharacterAliases([...value, trimmed]);
		if (next.length === value.length) {
			return;
		}

		onChange(next);
		setDraft("");
	}

	return (
		<div className="space-y-2">
			<div className="flex gap-2">
				<TextInput
					value={draft}
					disabled={disabled}
					placeholder={placeholder}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							addAlias(draft);
						}
					}}
				/>
				<button
					type="button"
					disabled={disabled || !draft.trim()}
					className="shrink-0 rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2 text-sm font-medium text-ink-soft transition hover:bg-panel-muted disabled:cursor-not-allowed disabled:opacity-50"
					onClick={() => addAlias(draft)}
				>
					Add
				</button>
			</div>
			{value.length ? (
				<div className="flex flex-wrap gap-2">
					{value.map((alias) => (
						<span
							key={alias}
							className="inline-flex items-center gap-1.5 rounded-full border border-divider/[0.5] bg-panel-muted/60 px-2.5 py-1 text-xs text-ink-soft"
						>
							{alias}
							<button
								type="button"
								disabled={disabled}
								className="text-ink-muted transition hover:text-ink disabled:opacity-50"
								aria-label={`Remove ${alias}`}
								onClick={() => onChange(value.filter((entry) => entry !== alias))}
							>
								×
							</button>
						</span>
					))}
				</div>
			) : (
				<p className="text-[11px] text-ink-muted">
					Nicknames, titles, surnames, and other names the AI should recognise.
				</p>
			)}
		</div>
	);
}

export function KnownTiesInput({
	value,
	onChange,
	placeholder = "Morgan Reyes — mentor, Elena Reyes — sibling…",
	disabled,
}: {
	value: string[];
	onChange: (next: string[]) => void;
	placeholder?: string;
	disabled?: boolean;
}) {
	const [draft, setDraft] = useState("");

	function addKnownTie(raw: string) {
		const trimmed = raw.trim();
		if (!trimmed) {
			return;
		}

		const next = normalizePlayerCharacterKnownTies([...value, trimmed]);
		if (next.length === value.length) {
			return;
		}

		onChange(next);
		setDraft("");
	}

	return (
		<div className="space-y-2">
			<div className="flex gap-2">
				<TextInput
					value={draft}
					disabled={disabled}
					placeholder={placeholder}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							addKnownTie(draft);
						}
					}}
				/>
				<button
					type="button"
					disabled={disabled || !draft.trim()}
					className="shrink-0 rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2 text-sm font-medium text-ink-soft transition hover:bg-panel-muted disabled:cursor-not-allowed disabled:opacity-50"
					onClick={() => addKnownTie(draft)}
				>
					Add
				</button>
			</div>
			{value.length ? (
				<div className="flex flex-wrap gap-2">
					{value.map((tie) => (
						<span
							key={tie}
							className="inline-flex items-center gap-1.5 rounded-full border border-divider/[0.5] bg-panel-muted/60 px-2.5 py-1 text-xs text-ink-soft"
						>
							{tie}
							<button
								type="button"
								disabled={disabled}
								className="text-ink-muted transition hover:text-ink disabled:opacity-50"
								aria-label={`Remove ${tie}`}
								onClick={() => onChange(value.filter((entry) => entry !== tie))}
							>
								×
							</button>
						</span>
					))}
				</div>
			) : (
				<p className="text-[11px] text-ink-muted">
					Optional canon characters and relationships the AI may reference. Leave empty to avoid dragging in the whole cast.
				</p>
			)}
		</div>
	);
}
