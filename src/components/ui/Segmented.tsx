"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

export interface SegmentedProps<T extends string = string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
}

export function Segmented<T extends string = string>({
  options,
  value,
  onChange,
  size = "md",
  className,
}: SegmentedProps<T>) {
  const sizes = {
    sm: "p-0.5 text-xs",
    md: "p-1 text-sm",
  };

  const itemSizes = {
    sm: "px-2.5 py-1 text-xs",
    md: "px-3.5 py-1.5 text-xs",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-[var(--radius)] bg-[var(--color-bg-muted)] border border-[var(--color-border)]",
        sizes[size],
        className
      )}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 font-medium rounded-[var(--radius-sm)] transition-all cursor-pointer",
              itemSizes[size],
              isSelected
                ? "bg-[var(--color-bg-elevated)] text-[var(--color-fg)] shadow-xs"
                : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
