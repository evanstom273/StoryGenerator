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
    "inline-flex items-center justify-center gap-2 rounded-full font-medium transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-app disabled:pointer-events-none disabled:opacity-50";

  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-accent text-accent-foreground shadow-[0_18px_40px_rgb(var(--accent-rgb)/0.35)] hover:-translate-y-0.5 hover:bg-accent-hover",
    secondary:
      "border border-divider bg-panel-muted text-ink hover:-translate-y-0.5 hover:border-accent/35 hover:bg-panel-strong",
    ghost: "text-ink-soft hover:bg-panel-muted",
  };

  const sizes: Record<ButtonSize, string> = {
    sm: "px-3.5 py-2 text-sm",
    md: "px-5 py-2.5 text-sm",
    lg: "px-6 py-3 text-base",
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
