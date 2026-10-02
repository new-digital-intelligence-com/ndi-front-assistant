import type { Metadata } from "next";
import { AidaJoin } from "@/components/aida/AidaJoin";

export const metadata: Metadata = {
  title: "Talk to CDA",
  robots: { index: false, follow: false },
};

// The customer side of Aida. Open without the site password (see src/proxy.ts): the room code is
// what lets a customer in, and they can never become CDA staff from here.
export default async function AidaJoinPage({ searchParams }: PageProps<"/aida/join">) {
  const { code } = await searchParams;

  return (
    <>
      <header className="bg-cda-dark text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
          <span className="rounded-md bg-cda-red px-2.5 py-1 text-xl font-extrabold tracking-wider">CDA</span>
          <span className="text-lg font-semibold">Customer call</span>
        </div>
        <div className="h-1 bg-cda-red" />
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <AidaJoin initialCode={typeof code === "string" ? code : ""} />
      </main>
    </>
  );
}
