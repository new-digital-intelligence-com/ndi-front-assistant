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
    <main className="bg-night-hero flex flex-1 items-center justify-center px-4 py-12">
      <div className="animate-fade-up w-full max-w-sm">
        <div className="rounded-3xl bg-white p-8 shadow-card">
          <NdiLogo className="h-20 w-auto" />
          <h1 className="mt-6 text-2xl font-bold tracking-tight text-heading">Meet Clara</h1>
          <p className="mt-1 text-sm text-muted">
            NDI&apos;s virtual assistant: a live demo of the Multi-Channel Front Office Assistant.
          </p>
          {sitePasswordConfigured() ? (
            <LoginForm nextPath={nextPath} />
          ) : (
            <p className="mt-6 rounded-xl bg-red-50 p-3 text-sm text-brand-dark">
              This demo is locked: the SITE_PASSWORD environment variable is not set.
            </p>
          )}
        </div>
        <p className="mt-5 text-center text-xs text-white/50">NDI – New Digital Intelligence · new-digital-intelligence.com</p>
      </div>
    </main>
  );
}
