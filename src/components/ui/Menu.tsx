"use client";

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/cn";

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({
  className,
  align = "end",
  sideOffset = 6,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[13rem] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)]",
          "bg-[var(--color-bg-elevated)] p-1 shadow-[var(--shadow-lg)]",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          className
        )}
        {...props}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

export function MenuItem({
  className,
  icon,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenu.Item> & { icon?: React.ReactNode }) {
  return (
    <DropdownMenu.Item
      className={cn(
        "flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--radius-sm)] text-xs font-medium",
        "text-[var(--color-fg)] cursor-pointer select-none outline-none",
        "data-[highlighted]:bg-[var(--color-bg-subtle)]",
        "data-[disabled]:opacity-40 data-[disabled]:pointer-events-none",
        className
      )}
      {...props}
    >
      {icon && <span className="text-[var(--color-fg-muted)] shrink-0">{icon}</span>}
      {children}
    </DropdownMenu.Item>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-[var(--color-border)]" />;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenu.Label className="px-2.5 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
      {children}
    </DropdownMenu.Label>
  );
}
