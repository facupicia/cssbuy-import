"use client";

import { toast as hotToast, Toaster as HotToaster } from "react-hot-toast";
import { CheckCircle2, AlertCircle, Info, AlertTriangle } from "lucide-react";

export const toast = {
  success: (msg: string, opts?: { description?: string; duration?: number }) => {
    hotToast.custom(
      (t) => (
        <div
          className={`flex items-start gap-2.5 px-4 py-3 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-lg text-sm text-[var(--color-fg)] transition-all ${
            t.visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
        >
          <CheckCircle2 className="h-4 w-4 text-[var(--color-success)] flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-xs text-[var(--color-fg)]">{msg}</p>
            {opts?.description && (
              <p className="text-[11px] text-[var(--color-fg-muted)] mt-0.5">{opts.description}</p>
            )}
          </div>
        </div>
      ),
      { duration: opts?.duration ?? 3500 }
    );
  },
  error: (msg: string, opts?: { description?: string; duration?: number }) => {
    hotToast.custom(
      (t) => (
        <div
          className={`flex items-start gap-2.5 px-4 py-3 bg-[var(--color-bg-elevated)] border border-[var(--color-danger)]/30 rounded-[var(--radius-lg)] shadow-lg text-sm text-[var(--color-fg)] transition-all ${
            t.visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
        >
          <AlertCircle className="h-4 w-4 text-[var(--color-danger)] flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-xs text-[var(--color-fg)]">{msg}</p>
            {opts?.description && (
              <p className="text-[11px] text-[var(--color-fg-muted)] mt-0.5">{opts.description}</p>
            )}
          </div>
        </div>
      ),
      { duration: opts?.duration ?? 4500 }
    );
  },
  warning: (msg: string, opts?: { description?: string; duration?: number }) => {
    hotToast.custom(
      (t) => (
        <div
          className={`flex items-start gap-2.5 px-4 py-3 bg-[var(--color-bg-elevated)] border border-[var(--color-warning)]/30 rounded-[var(--radius-lg)] shadow-lg text-sm text-[var(--color-fg)] transition-all ${
            t.visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
        >
          <AlertTriangle className="h-4 w-4 text-[var(--color-warning)] flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-xs text-[var(--color-fg)]">{msg}</p>
            {opts?.description && (
              <p className="text-[11px] text-[var(--color-fg-muted)] mt-0.5">{opts.description}</p>
            )}
          </div>
        </div>
      ),
      { duration: opts?.duration ?? 4000 }
    );
  },
  info: (msg: string, opts?: { description?: string; duration?: number }) => {
    hotToast.custom(
      (t) => (
        <div
          className={`flex items-start gap-2.5 px-4 py-3 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-lg text-sm text-[var(--color-fg)] transition-all ${
            t.visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
        >
          <Info className="h-4 w-4 text-[var(--color-info)] flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-xs text-[var(--color-fg)]">{msg}</p>
            {opts?.description && (
              <p className="text-[11px] text-[var(--color-fg-muted)] mt-0.5">{opts.description}</p>
            )}
          </div>
        </div>
      ),
      { duration: opts?.duration ?? 3500 }
    );
  },
};

export function Toaster() {
  return <HotToaster position="bottom-right" />;
}
