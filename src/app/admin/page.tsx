import type { Metadata } from "next";
import { AdminApp } from "@/components/admin/AdminApp";
import { NdiLogo } from "@/components/NdiLogo";

export const metadata: Metadata = {
  title: "Admin – NDI Assistant",
  robots: { index: false, follow: false },
};

// The staff side of the demo. Open past the site password (see src/proxy.ts): the page asks for the
// Aida staff password itself, and every /api/admin/* and staff /api/aida/* route checks that token.
export default function AdminPage() {
  return (
    <>
      <header className="bg-white">
        <div className="mx-auto flex h-[3.25rem] max-w-7xl items-center gap-3 px-4">
          <NdiLogo tagline={false} className="h-7 w-auto shrink-0" />
          <span className="h-6 w-px shrink-0 bg-line" aria-hidden="true" />
          <span className="text-lg font-semibold text-heading">Admin</span>
          <span className="rounded-full bg-heading px-2.5 py-0.5 text-xs font-semibold text-white">staff only</span>
          <span className="ml-auto hidden text-xs text-muted sm:block">NDI Assistant · staff page</span>
        </div>
        <div className="h-1 bg-accent" />
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4">
        <AdminApp />
      </main>
    </>
  );
}
