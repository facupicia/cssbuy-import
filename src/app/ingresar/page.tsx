import type { Metadata } from "next";
import { AccountLogin } from "@/components/admin/AccountLogin";

export const metadata: Metadata = { title: "Ingresar · PLUG", robots: { index: false, follow: false } };
export default function LoginPage() { return <AccountLogin />; }
