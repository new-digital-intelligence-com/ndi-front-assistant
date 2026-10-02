import type { Metadata } from "next";
import { AidaJoin } from "@/components/aida/AidaJoin";
import { NdiLogo } from "@/components/NdiLogo";

export const metadata: Metadata = {
  title: "Talk to NDI",
  robots: { index: false, follow: false },
};

// The customer side of Aida. Open without the site password (see src/proxy.ts): the room code is
// what lets a customer in, and they can never become NDI staff from here.
export default async function AidaJoinPage({ searchParams }: PageProps<"/aida/join">) {
  const { code } = await searchParams;

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <NdiLogo tagline={false} className="h-7 w-auto shrink-0" />
          <span className="h-6 w-px shrink-0 bg-line" aria-hidden="true" />
          <span className="text-lg font-semibold tracking-tight text-heading">Customer call</span>
        </div>
      </header>
      <main className="animate-fade-up mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">
        <AidaJoin initialCode={typeof code === "string" ? code : ""} />
      </main>
    </>
  );
}
