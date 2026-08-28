import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: "CSSBuy Landed Cost Calculator & Cotizaciones",
  description: "Calculadora avanzada de costos de importación, flete internacional, franquicias aduaneras y cotizador de productos CSSBuy.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen bg-[var(--color-bg)] text-[var(--color-fg)] antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
