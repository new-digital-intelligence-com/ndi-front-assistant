import type { Metadata } from "next";
import { AdminApp } from "@/components/admin/AdminApp";

export const metadata: Metadata = {
  title: "Admin – CDA Customer Assistant Demo",
  robots: { index: false, follow: false },
};

// The staff side of the demo. Open past the site password (see src/proxy.ts): the page asks for the
// Aida staff password itself, and every /api/admin/* and staff /api/aida/* route checks that token.
export default function AdminPage() {
  return (
    <>
      <div className="bg-cda-ink px-4 py-1.5 text-center text-xs text-white/80">NDI demo · not an official CDA website</div>
      <header className="bg-cda-dark text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4">
          <span className="rounded-md bg-cda-red px-2.5 py-1 text-xl font-extrabold tracking-wider">CDA</span>
          <span className="text-lg font-semibold">Admin</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80">staff only</span>
        </div>
        <div className="h-1 bg-cda-red" />
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4">
        <AdminApp />
      </main>
    </>
  );
}
