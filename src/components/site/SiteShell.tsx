"use client";

import { ArrowUpRight, LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AccountPanel } from "../AccountPanel";
import AssistantApp from "../AssistantApp";
import { ChannelLinks } from "../ChannelLinks";
import { NdiLogo } from "../NdiLogo";
import type { CallLanguage } from "../types";
import { MODES, modeFromPath } from "./modes";

const HELP_TOPICS = [
  "What AI Employees are and what they do",
  "Finding the right AI Employee for your process",
  "How NDI works: implementation, go-live and the pay-per-use model",
  "Booking a meeting or a demo with the NDI team",
  "NDI's offices and contacts",
];

/**
 * The customer site around Clara: a menu with the four ways to talk to her (each at its own address,
 * see ./modes.ts), what she can help with, the other channels and the customer's NDI account. On a
 * phone the menu slides in from the left and the four ways sit in a bar at the bottom.
 *
 * The assistant lives here, in the layout, so the call language chosen once stays for voice and
 * avatar. It is keyed by the way of talking: switching ends the conversation on screen, as before.
 */
export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const mode = modeFromPath(pathname);
  const [callLanguage, setCallLanguage] = useState<CallLanguage>("en");
  const [menuOpen, setMenuOpen] = useState(false);
  const [shownPath, setShownPath] = useState(pathname);
  if (shownPath !== pathname) {
    // A link in the menu was followed: close it.
    setShownPath(pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="flex h-dvh min-h-[560px] w-full overflow-hidden">
      {menuOpen && (
        <button
          type="button"
          aria-label="Close the menu"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] lg:hidden"
        />
      )}

      <aside
        aria-label="Menu"
        className={`fixed inset-y-0 left-0 z-50 flex w-[86%] max-w-[330px] flex-col bg-white shadow-2xl transition-[translate,visibility] duration-300 lg:visible lg:static lg:z-auto lg:w-[300px] lg:max-w-none lg:translate-x-0 lg:border-r lg:border-line lg:shadow-none xl:w-[320px] ${
          menuOpen ? "visible translate-x-0" : "invisible -translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between gap-2 px-5 pb-4 pt-5">
          <div>
            <Link href="/" className="flex items-center gap-3" aria-label="NDI Assistant, chat with Clara">
              <NdiLogo tagline={false} className="h-7 w-auto shrink-0" />
              <span className="h-6 w-px bg-line" aria-hidden="true" />
              <span className="text-lg font-semibold tracking-tight text-heading">Assistant</span>
            </Link>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand-dark">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-hidden="true" />
              Live demo of NDI&apos;s Front Office Assistant
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Close the menu"
            className="rounded-lg p-2 text-muted transition hover:bg-surface hover:text-heading lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav aria-label="Ways to talk to Clara" className="px-3">
          <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Talk to Clara</p>
          <ul className="space-y-1">
            {MODES.map((item) => {
              const active = item.mode === mode;
              const Icon = item.icon;
              return (
                <li key={item.mode}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`group flex items-center gap-3 rounded-xl px-2 py-2 transition ${
                      active ? "bg-brand-soft" : "hover:bg-surface"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${
                        active ? "bg-brand text-white shadow-glow" : "bg-surface text-ink group-hover:bg-white group-hover:shadow-sm"
                      }`}
                    >
                      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 leading-tight">
                      <span className={`block text-sm font-semibold ${active ? "text-brand-dark" : "text-heading"}`}>{item.label}</span>
                      <span className="block truncate text-xs text-muted">{item.description}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="scroll-thin mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto border-t border-line px-3 pb-4 pt-4">
          <section className="rounded-2xl bg-surface p-4">
            <h2 className="text-sm font-semibold text-heading">What Clara can help with</h2>
            <ul className="mt-2.5 space-y-2 text-[13px] leading-snug text-muted">
              {HELP_TOPICS.map((topic) => (
                <li key={topic} className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                  {topic}
                </li>
              ))}
            </ul>
          </section>
          <ChannelLinks />
          <AccountPanel />
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
          <a
            href="https://new-digital-intelligence.com/contact"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted transition hover:bg-surface hover:text-heading"
          >
            Contact NDI <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
          <form action="/api/logout" method="post">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted transition hover:bg-surface hover:text-heading"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Log out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-white/85 px-3 backdrop-blur lg:hidden">
          <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label="NDI Assistant, chat with Clara">
            <NdiLogo tagline={false} className="h-6 w-auto shrink-0" />
            <span className="h-5 w-px bg-line" aria-hidden="true" />
            <span className="truncate font-semibold tracking-tight text-heading">Assistant</span>
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-1.5 text-sm font-semibold text-heading shadow-sm"
          >
            <Menu className="h-4 w-4" aria-hidden="true" /> Menu
          </button>
        </header>

        <main className="flex min-h-0 flex-1 flex-col p-2 sm:p-3 lg:p-5">
          <AssistantApp key={mode} mode={mode} callLanguage={callLanguage} onCallLanguageChange={setCallLanguage} />
          {children}
        </main>

        <nav aria-label="Ways to talk to Clara" className="grid shrink-0 grid-cols-4 border-t border-line bg-white/95 backdrop-blur lg:hidden">
          {MODES.map((item) => {
            const active = item.mode === mode;
            const Icon = item.icon;
            return (
              <Link
                key={item.mode}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 pb-2 pt-2.5 text-[11px] font-semibold transition ${
                  active ? "text-brand" : "text-muted hover:text-heading"
                }`}
              >
                {active && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-brand" aria-hidden="true" />}
                <Icon className="h-5 w-5" aria-hidden="true" />
                {item.short}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
