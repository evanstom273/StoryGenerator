import type {
  InputHTMLAttributes,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../utils/cn";

export function Field({
  label,
  hint,
  action,
  children,
}: {
  label: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-ink-soft">{label}</span>
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
