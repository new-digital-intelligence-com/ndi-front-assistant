"use client";

import { ArrowUpRight, LogOut, Menu, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Lobby, StaffSignIn } from "../aida/AidaLobby";
import { rememberStaffToken, savedName, savedStaffToken } from "../aida/types";
import { NdiLogo } from "../NdiLogo";
import { CallsPanel } from "./CallsPanel";
import { CustomersPanel } from "./CustomersPanel";
import { KnowledgePanel } from "./KnowledgePanel";
import { MoodPanel } from "./MoodPanel";
import { RepliesPanel } from "./RepliesPanel";
import { ADMIN_SECTIONS, sectionFromPath, type AdminSection } from "./sections";

/**
 * The staff console (/admin/...), behind the Aida staff password rather than the site password: Aida
 * rooms, who the customers are, how they felt, call lists Clara phones, what Clara could not answer
 * (and the answers staff approve for her), and the reply switches for email, Instagram and Messenger.
 * Each section has its own address (./sections.ts); the sign-in is kept per browser tab, so an invite
 * link opened in another tab joins as a customer.
 *
 * The sections live here, in the layout, and stay mounted once opened: moving to Customers does not
 * drop a staff member out of an Aida call or a hand-over, and coming back shows the section as it was.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const active = sectionFromPath(pathname);
  const [staffToken, setStaffToken] = useState<string | null>(null);
  const [staffName, setStaffName] = useState("");
  const [checked, setChecked] = useState(false);
  const [opened, setOpened] = useState<Set<AdminSection>>(() => new Set(["rooms", active]));
  if (!opened.has(active)) setOpened(new Set(opened).add(active));
  const [menuOpen, setMenuOpen] = useState(false);
  const [shownPath, setShownPath] = useState(pathname);
  if (shownPath !== pathname) {
    setShownPath(pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      setStaffToken(savedStaffToken());
      setStaffName(savedName());
      setChecked(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const signOut = useCallback(() => {
    rememberStaffToken(null);
    setStaffToken(null);
  }, []);

  if (!checked) return <div className="min-h-dvh bg-night" />;
  if (!staffToken) {
    return (
      <main className="bg-night-hero flex min-h-dvh items-center justify-center px-4 py-12">
        <div className="animate-fade-up w-full max-w-md">
          <div className="mb-6 flex items-center justify-center gap-3">
            <NdiLogo tagline={false} className="h-9 w-auto" />
            <span className="h-7 w-px bg-white/20" aria-hidden="true" />
            <span className="text-xl font-semibold tracking-tight text-white">Admin</span>
          </div>
          <StaffSignIn
            onSignedIn={(token) => {
              rememberStaffToken(token);
              setStaffToken(token);
              setStaffName(savedName());
            }}
          />
          <p className="mt-5 text-center text-xs text-white/50">NDI Assistant · staff console</p>
        </div>
      </main>
    );
  }

  const section = ADMIN_SECTIONS.find((item) => item.id === active) ?? ADMIN_SECTIONS[0];
  const SectionIcon = section.icon;
  /** The open section settles in; the others stay mounted but hidden. */
  const shown = (id: AdminSection, extra = "") => (active === id ? `animate-fade-up ${extra}` : "hidden");

  return (
    <div className="flex h-dvh min-h-[560px] w-full overflow-hidden">
      {menuOpen && (
        <button
          type="button"
          aria-label="Close the menu"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] lg:hidden"
        />
      )}

      <aside
        aria-label="Admin menu"
        className={`bg-night-glow fixed inset-y-0 left-0 z-50 flex w-[82%] max-w-[300px] flex-col text-white shadow-2xl transition-[translate,visibility] duration-300 lg:visible lg:static lg:z-auto lg:w-[260px] lg:max-w-none lg:translate-x-0 lg:shadow-none ${
          menuOpen ? "visible translate-x-0" : "invisible -translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-5 pb-5 pt-5">
          <Link href="/admin/rooms" className="flex items-center gap-3" aria-label="NDI Assistant admin">
            <NdiLogo tagline={false} className="h-7 w-auto shrink-0" />
            <span className="h-6 w-px bg-white/20" aria-hidden="true" />
            <span className="text-lg font-semibold tracking-tight">Admin</span>
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Close the menu"
            className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav aria-label="Admin sections" className="scroll-thin-dark min-h-0 flex-1 overflow-y-auto px-3">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">Staff console</p>
          <ul className="space-y-1">
            {ADMIN_SECTIONS.map((item) => {
              const isActive = item.id === active;
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                      isActive ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {isActive && <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-accent" aria-hidden="true" />}
                    <Icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? "text-accent" : ""}`} aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="space-y-1 border-t border-white/10 px-3 py-3">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-white/65 transition hover:bg-white/5 hover:text-white"
          >
            Customer site <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
          <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold uppercase">
              {(staffName.trim()[0] ?? "S").toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-semibold">{staffName.trim() || "Staff"}</span>
              <span className="flex items-center gap-1 text-[11px] text-white/50">
                <ShieldCheck className="h-3 w-3" aria-hidden="true" /> NDI staff
              </span>
            </span>
            <button
              type="button"
              onClick={signOut}
              title="Sign out"
              aria-label="Sign out"
              className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-night flex h-14 shrink-0 items-center justify-between gap-3 px-3 text-white lg:hidden">
          <Link href="/admin/rooms" className="flex items-center gap-2.5" aria-label="NDI Assistant admin">
            <NdiLogo tagline={false} className="h-6 w-auto shrink-0" />
            <span className="h-5 w-px bg-white/20" aria-hidden="true" />
            <span className="font-semibold tracking-tight">Admin</span>
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-sm font-semibold"
          >
            <Menu className="h-4 w-4" aria-hidden="true" /> {section.label}
          </button>
        </header>

        <main className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {/* Every section uses the whole width beside the menu (the user's request, 4 Oct 2026). */}
          <div className="w-full px-3 py-5 sm:px-6 lg:px-8 lg:py-7">
            <header key={section.id} className="animate-fade-up mb-5 flex items-start gap-3">
              <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-brand shadow-sm sm:flex">
                <SectionIcon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight text-heading">{section.title}</h1>
                <p className="mt-0.5 text-sm text-muted">{section.description}</p>
              </div>
            </header>

            <div className={shown("rooms")}>
              <Lobby staffToken={staffToken} onSignOut={signOut} />
            </div>
            {opened.has("customers") && (
              <div className={shown("customers")}>
                <CustomersPanel staffToken={staffToken} onSignOut={signOut} />
              </div>
            )}
            {opened.has("mood") && (
              <div className={shown("mood")}>
                <MoodPanel staffToken={staffToken} onSignOut={signOut} />
              </div>
            )}
            {opened.has("calls") && (
              <div className={shown("calls")}>
                <CallsPanel staffToken={staffToken} onSignOut={signOut} />
              </div>
            )}
            {opened.has("knowledge") && (
              <div className={shown("knowledge")}>
                <KnowledgePanel staffToken={staffToken} onSignOut={signOut} />
              </div>
            )}
            {opened.has("replies") && (
              <div className={shown("replies")}>
                <RepliesPanel staffToken={staffToken} onSignOut={signOut} />
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
