"use client";

import { forwardRef, HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: "none" | "sm" | "md" | "lg";
  variant?: "default" | "subtle" | "elevated" | "accent";
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      className,
      padding = "md",
      variant = "default",
      children,
      ...props
    },
    ref
  ) => {
    const paddings = {
      none: "p-0",
      sm: "p-3",
      md: "p-5",
      lg: "p-6",
    };

    const variants = {
      default:
        "bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-xs",
      subtle:
        "bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-lg)]",
      elevated:
        "bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-[var(--radius-xl)] shadow-md",
      accent:
        "bg-[var(--color-accent-soft)] border border-[var(--color-accent-border)] rounded-[var(--radius-lg)]",
    };

    return (
      <div
        ref={ref}
        className={cn(variants[variant], paddings[padding], className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";
