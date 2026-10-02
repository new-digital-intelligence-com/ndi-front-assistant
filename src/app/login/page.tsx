import type { Metadata } from "next";
import Link from "next/link";
import { safeNextPath, sitePasswordConfigured } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in – CDA Customer Assistant Demo",
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(typeof next === "string" ? next : undefined);

  return (
    <main className="flex flex-1 items-center justify-center bg-heading px-4 py-12">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-xl">
        <div className="flex items-center gap-3">
          <span className="rounded-md bg-brand px-2.5 py-1 text-xl font-extrabold tracking-wider text-white">CDA</span>
          <span className="text-lg font-semibold text-heading">Customer Assistant</span>
        </div>
        <p className="mt-2 text-xs text-muted">
          NDI demo · not an official CDA website ·{" "}
          <Link href="/docs" className="underline">
            How this demo works
          </Link>
        </p>
        {sitePasswordConfigured() ? (
          <LoginForm nextPath={nextPath} />
        ) : (
          <p className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-brand-dark">
            This demo is locked: the SITE_PASSWORD environment variable is not set.
          </p>
        )}
      </div>
    </main>
  );
}
