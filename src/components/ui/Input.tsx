"use client";

import { forwardRef, InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  label?: string;
  error?: string;
  hint?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, prefix, suffix, id, disabled, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-medium text-[var(--color-fg-muted)] tracking-wide uppercase"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {prefix && (
            <div className="absolute left-3 flex items-center pointer-events-none text-[var(--color-fg-subtle)] text-sm">
              {prefix}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            className={cn(
              "w-full h-9 px-3 text-sm bg-[var(--color-bg-elevated)] text-[var(--color-fg)] border border-[var(--color-border)] rounded-[var(--radius)] transition-colors placeholder:text-[var(--color-fg-subtle)]/60 focus:outline-none focus:border-[var(--color-border-focus)] disabled:opacity-50 disabled:bg-[var(--color-bg-subtle)]",
              prefix && "pl-8",
              suffix && "pr-8",
              error && "border-[var(--color-danger)] focus:border-[var(--color-danger)]",
              className
            )}
            {...props}
          />
          {suffix && (
            <div className="absolute right-3 flex items-center pointer-events-none text-[var(--color-fg-subtle)] text-sm">
              {suffix}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
        {hint && !error && <p className="text-xs text-[var(--color-fg-subtle)]">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
