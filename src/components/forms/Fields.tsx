import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useRef } from "react";
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

  function snapHeightIfNeeded() {
    const element = ref.current;
    if (!element) {
      return;
    }

    const currentHeight = element.offsetHeight;
    const clampedHeight = Math.max(minHeightPx, Math.min(maxHeightPx, currentHeight));

    if (Math.abs(clampedHeight - defaultHeightPx) <= snapThresholdPx) {
      element.style.height = `${defaultHeightPx}px`;
      return;
    }

    if (clampedHeight !== currentHeight) {
      element.style.height = `${clampedHeight}px`;
    }
  }

  return (
    <textarea
      ref={ref}
      className={cn(inputClasses, "resize-y", className)}
      style={{
        ...style,
        height: style?.height ?? `${defaultHeightPx}px`,
        minHeight: `${minHeightPx}px`,
        maxHeight: `${maxHeightPx}px`,
      }}
      onMouseUp={(event) => {
        snapHeightIfNeeded();
        onMouseUp?.(event);
      }}
      onTouchEnd={(event) => {
        snapHeightIfNeeded();
        onTouchEnd?.(event);
      }}
      {...props}
    />
  );
}
