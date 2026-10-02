import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = {
  title: "Admin – NDI Assistant",
  robots: { index: false, follow: false },
};

// The staff side of the demo, one address per section (src/components/admin/sections.ts). Open past the
// site password (see src/proxy.ts): the console asks for the Aida staff password itself, and every
// /api/admin/* and staff /api/aida/* route checks that token.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AdminShell>{children}</AdminShell>;
}
