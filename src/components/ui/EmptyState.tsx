import { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 text-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-subtle)]/40",
        className
      )}
    >
      {icon && (
        <div className="w-12 h-12 mb-3 rounded-full bg-[var(--color-bg-muted)] flex items-center justify-center text-[var(--color-fg-muted)]">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-[var(--color-fg)]">{title}</h3>
      {description && (
        <p className="mt-1 text-xs text-[var(--color-fg-muted)] max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
