"use client";

import { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "danger" | "info" | "outline";
  size?: "sm" | "md";
  icon?: ReactNode;
}

export function Badge({
  className,
  variant = "default",
  size = "md",
  icon,
  children,
  ...props
}: BadgeProps) {
  const sizes = {
    sm: "px-1.5 py-0.5 text-[10px] gap-1",
    md: "px-2.5 py-0.5 text-xs gap-1.5",
  };

  const variants = {
    default: "bg-[var(--color-bg-muted)] text-[var(--color-fg)] border border-[var(--color-border)]",
    success: "bg-[var(--color-success-soft)] text-[var(--color-success)] border border-[var(--color-success)]/20",
    warning: "bg-[var(--color-warning-soft)] text-[var(--color-warning)] border border-[var(--color-warning)]/20",
    danger: "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border border-[var(--color-danger)]/20",
    info: "bg-[var(--color-info-soft)] text-[var(--color-info)] border border-[var(--color-info)]/20",
    outline: "bg-transparent text-[var(--color-fg-muted)] border border-[var(--color-border)]",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-full",
        sizes[size],
        variants[variant],
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}
