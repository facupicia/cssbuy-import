"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface StatTileProps {
  label: string;
  /** Cifra principal. Es lo primero que se lee del bloque. */
  value: string;
  /** Misma magnitud en la otra moneda, o el detalle secundario. */
  sub?: string;
  icon?: ReactNode;
  tone?: "neutral" | "accent" | "success" | "danger";
  className?: string;
}

const tones = {
  neutral: "text-[var(--color-fg)]",
  accent: "text-[var(--color-accent)]",
  success: "text-[var(--color-success)]",
  danger: "text-[var(--color-danger)]",
};

export function StatTile({ label, value, sub, icon, tone = "neutral", className }: StatTileProps) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--color-fg-muted)]">
        {icon}
        {label}
      </span>
      <p className={cn("text-xl xl:text-2xl font-bold font-mono tnum truncate", tones[tone])}>{value}</p>
      {sub && <p className="text-xs font-mono tnum text-[var(--color-fg-muted)] truncate">{sub}</p>}
    </div>
  );
}
