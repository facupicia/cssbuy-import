"use client";

import { forwardRef, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "secondary",
      size = "md",
      loading = false,
      disabled,
      icon,
      children,
      ...props
    },
    ref
  ) => {
    const base =
      "inline-flex items-center justify-center gap-2 font-medium transition-all select-none disabled:opacity-50 disabled:pointer-events-none cursor-pointer";

    const sizes = {
      sm: "h-8 px-2.5 text-xs rounded-[var(--radius-sm)]",
      md: "h-9 px-3.5 text-sm rounded-[var(--radius)]",
      lg: "h-11 px-5 text-base rounded-[var(--radius-lg)]",
    };

    const variants = {
      primary:
        "bg-[var(--color-fg)] text-[var(--color-bg)] hover:opacity-90 active:scale-[0.98] shadow-sm",
      secondary:
        "bg-[var(--color-bg-subtle)] text-[var(--color-fg)] border border-[var(--color-border)] hover:bg-[var(--color-bg-muted)] active:scale-[0.98]",
      danger:
        "bg-[var(--color-danger)] text-white hover:opacity-90 active:scale-[0.98]",
      ghost:
        "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-subtle)]",
      outline:
        "border border-[var(--color-border)] text-[var(--color-fg)] hover:bg-[var(--color-bg-subtle)]",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(base, sizes[size], variants[variant], className)}
        {...props}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-current" />
        ) : (
          icon
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
