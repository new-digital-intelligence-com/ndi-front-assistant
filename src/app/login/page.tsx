import type { Metadata } from "next";
import { safeNextPath, sitePasswordConfigured } from "@/lib/auth";
import { NdiLogo } from "@/components/NdiLogo";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in – NDI Assistant",
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(typeof next === "string" ? next : undefined);

  return (
    <main className="flex flex-1 items-center justify-center bg-heading px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border-t-4 border-accent bg-white p-8 shadow-xl">
        <NdiLogo className="h-24 w-auto" />
        <p className="mt-4 text-lg font-semibold text-heading">Assistant</p>
        <p className="mt-2 text-xs text-muted">A live demo of NDI&apos;s Multi-Channel Front Office Assistant</p>
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
