import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../utils/cn";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: ButtonClassOptions = {}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-[8px] font-medium transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-app disabled:pointer-events-none disabled:opacity-50";

  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-accent text-[13px] font-bold text-accent-foreground hover:bg-accent-hover",
    secondary:
      "border border-divider bg-panel-muted text-xs font-medium text-ink-soft hover:border-accent/[0.25] hover:bg-panel",
    ghost: "text-ink-soft hover:bg-panel-muted",
  };

  const sizes: Record<ButtonSize, string> = {
    sm: "px-3 py-2 text-xs",
    md: "px-3 py-2.5 text-sm",
    lg: "px-6 py-[11px] text-[13px]",
  };

  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, className })}
      {...props}
    />
  );
}
