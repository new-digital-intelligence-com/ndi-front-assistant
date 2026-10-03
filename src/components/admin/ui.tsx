"use client";

import type { LucideIcon } from "lucide-react";
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
