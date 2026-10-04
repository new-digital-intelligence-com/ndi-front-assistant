"use client";

import { PenLine, Zap, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

// Building blocks shared by the staff console's sections (Knowledge, Customers, Mood), so their tabs,
// empty states and numbers look the same everywhere.

export type SectionTab = {
  href: string;
  label: string;
  /** A shorter label for phones. */
  short?: string;
  icon: LucideIcon;
  count?: number;
  /** A red count: something is waiting for staff. */
  highlight?: boolean;
};

/**
 * The address of a section's own pages (for example /admin/customers/overview), kept while staff are on
 * another section: the console keeps every section mounted, so a hidden one stays as it was.
 */
export function useSectionPath(prefix: string): string {
  const pathname = usePathname();
  const inside = pathname === prefix || pathname.startsWith(`${prefix}/`);
  const [kept, setKept] = useState(pathname);
  if (inside && kept !== pathname) setKept(pathname);
  return inside ? pathname : kept;
}

/** A section's tabs, each a page at its own address. */
export function SectionTabs({ label, tabs, active }: { label: string; tabs: SectionTab[]; active: string }) {
  return (
    <nav aria-label={label} className="flex gap-1 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-sm">
      {tabs.map((tab) => {
        const isActive = tab.href === active;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 py-2.5 text-sm font-semibold transition sm:gap-2 sm:px-3 ${
              isActive ? "bg-heading text-white shadow" : "text-muted hover:bg-surface hover:text-heading"
            }`}
          >
            <Icon className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />
            {tab.short ? (
              <>
                <span className="sm:hidden">{tab.short}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </>
            ) : (
              tab.label
            )}
            {tab.count !== undefined && (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  isActive ? "bg-white/15 text-white" : tab.highlight && tab.count ? "bg-brand text-white" : "bg-surface text-muted"
                }`}
              >
                {tab.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** What an empty tab or list shows. */
export function Empty({ icon: Icon, title, text, children }: { icon: LucideIcon; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-white/60 px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-muted shadow-sm">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="mt-3 font-semibold text-heading">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {children}
    </div>
  );
}

/** One number with its label, for the rows of numbers at the top of a page. */
export function StatTile({
  icon: Icon,
  label,
  value,
  note,
  swatch,
  alert = false,
  title,
}: {
  icon?: LucideIcon;
  label: string;
  value: string | number;
  note?: string;
  /** A colour square instead of an icon, matching a chart's legend. */
  swatch?: string;
  /** Something is waiting for staff. */
  alert?: boolean;
  title?: string;
}) {
  return (
    <div className={`rounded-2xl bg-white p-4 shadow-sm ${alert ? "ring-2 ring-brand/40" : ""}`} title={title}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted">{label}</p>
        {swatch ? (
          <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: swatch }} aria-hidden="true" />
        ) : (
          Icon && (
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${alert ? "bg-brand text-white" : "bg-brand-soft text-brand"}`}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
          )
        )}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-heading">{value}</p>
      {note && <p className="mt-0.5 text-[11px] text-muted">{note}</p>}
    </div>
  );
}

/** The white panel every block of a section sits in, with an optional title row. */
export function Panel({
  title,
  icon: Icon,
  aside,
  className = "",
  children,
}: {
  title?: string;
  icon?: LucideIcon;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-2xl bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {(title || aside) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && (
            <h2 className="flex items-center gap-2 text-sm font-semibold text-heading">
              {Icon && <Icon className="h-4 w-4 text-brand" aria-hidden="true" />}
              {title}
            </h2>
          )}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * A channel's tab on /admin/replies (Email, Instagram, Messenger): its settings on the left, staying in view,
 * and what came in across the rest of the width. On a narrower screen the settings come first.
 */
export function ChannelLayout({ settings, children }: { settings: ReactNode; children: ReactNode }) {
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)]">
      <div className="xl:sticky xl:top-0">{settings}</div>
      <div className="min-w-0 space-y-5">{children}</div>
    </div>
  );
}

/** A channel's settings card on /admin/replies: the channel, its address and how Clara answers there. */
export function ChannelPanel({
  icon: Icon,
  title,
  subtitle,
  badge,
  className = "",
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  badge?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`flex min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 ${className}`}>
      <header className="flex items-start gap-3 border-b border-line px-5 py-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-heading text-white">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="text-base font-semibold text-heading">{title}</h2>
            {badge}
          </div>
          <p className="mt-0.5 break-words text-xs text-muted">{subtitle}</p>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-5 p-5">{children}</div>
    </section>
  );
}

/** A list on /admin/replies (the latest emails, the drafts waiting): a title row, then rows edge to edge. */
export function ListPanel({ title, subtitle, aside, children }: { title: string; subtitle?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-heading">{title}</h2>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

export type ReplyMode = "auto" | "draft";

const MODES: Record<ReplyMode, { title: string; text: string; icon: LucideIcon }> = {
  auto: { title: "Send automatically", text: "Clara's answer goes to the customer straight away.", icon: Zap },
  draft: { title: "Draft for staff", text: "Clara's answer waits for staff to check and send it.", icon: PenLine },
};

/** Clara's answers on a channel: sent straight away, or kept as drafts for staff. One card per choice. */
export function ModeSwitch({
  mode,
  label,
  disabled,
  onChange,
  notes,
}: {
  mode: ReplyMode | undefined;
  label: string;
  disabled?: boolean;
  onChange: (mode: ReplyMode) => void;
  /** What a choice means on this channel, instead of the general words. */
  notes?: Partial<Record<ReplyMode, string>>;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2">
      {(["auto", "draft"] as const).map((value) => {
        const { title, text, icon: Icon } = MODES[value];
        const on = mode === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(value)}
            className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition disabled:cursor-wait disabled:opacity-60 ${
              on ? "border-brand bg-brand-soft/40 ring-1 ring-brand" : "border-line bg-white hover:border-heading/30 hover:bg-surface"
            }`}
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${on ? "bg-brand text-white" : "bg-surface text-muted"}`}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-heading">{title}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted">{notes?.[value] ?? text}</span>
            </span>
            <span
              aria-hidden="true"
              className={`mt-1 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-brand" : "border-line"}`}
            >
              {on && <span className="h-2 w-2 rounded-full bg-brand" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** "Automatic" or "Drafts for staff", for a channel's header. */
export function ModeBadge({ mode }: { mode: ReplyMode | undefined }) {
  if (!mode) return null;
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
        mode === "auto" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"
      }`}
    >
      {mode === "auto" ? "Automatic" : "Drafts for staff"}
    </span>
  );
}
