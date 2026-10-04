"use client";

import { LinkedText } from "../LinkedText";
import {
  Activity,
  ArrowLeft,
  Headset,
  History,
  IdCard,
  LayoutDashboard,
  Mail,
  MessagesSquare,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  TriangleAlert,
  UserRound,
  UserRoundCheck,
  Users,
  Waypoints,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Empty, Panel, SectionTabs, StatTile, useSectionPath, type SectionTab } from "./ui";

// The Customers section of the staff console, in two tabs at their own addresses:
// - People (/admin/customers): the list, and one customer at /admin/customers/<id> beside it, with
//   their profile, their history and Claude's insight in three tabs of their own.
// - Overview (/admin/customers/overview): the numbers, the channels and Claude on the whole week.

// Shapes returned by /api/admin/* (see src/lib/adminData.ts).
type AdminChannel = { channel: string; label: string; verified: boolean };
type CustomerSummary = {
  id: string;
  name: string | null;
  hasAccount: boolean;
  createdAt: string;
  lastActivity: string;
  activeNow: boolean;
  channels: AdminChannel[];
  notes: number;
  conversations: number;
};
type Overview = {
  customers: number;
  withAccount: number;
  multiChannel: number;
  active7Days: number;
  activeNow: number;
  channels: Record<string, number>;
  conversations7Days: Record<string, number>;
  emails: Record<string, number>;
  rooms: { open: number; closed: number };
};
type CustomerDetail = {
  customer: CustomerSummary;
  notes: { summary: string; channel: string | null; createdAt: string }[];
  conversations: {
    id: string;
    channel: string | null;
    createdAt: string;
    /** ElevenLabs' measured mood of the conversation (😊 Mood); null when it was not scored. */
    mood?: { label: "positive" | "neutral" | "negative"; score: number; frustration: number; upset: boolean } | null;
  }[];
  rooms: { code: string; title: string | null; createdAt: string; closedAt: string | null }[];
  emails: { subject: string | null; status: string; reason: string | null; createdAt: string }[];
};
type CustomerInsight = {
  summary: string;
  topics: string[];
  products: string[];
  sentiment: "positive" | "neutral" | "negative" | "unknown";
  sentimentReason: string;
  openIssues: string[];
  nextAction: string;
  flags: string[];
};
type WeekInsight = { summary: string; topTopics: string[]; commonProblems: string[]; products: string[]; suggestions: string[]; basedOn: number };

type Filter = "known" | "all" | "account" | "week";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "known", label: "Known people" },
  { id: "account", label: "With account" },
  { id: "week", label: "Active this week" },
  { id: "all", label: "Everyone" },
];

const CHANNEL_STYLE: Record<string, { icon: string; label: string; className: string }> = {
  email: { icon: "✉", label: "Email", className: "bg-red-50 text-brand-dark" },
  telegram: { icon: "✈", label: "Telegram", className: "bg-sky-50 text-sky-800" },
  instagram: { icon: "◎", label: "Instagram", className: "bg-pink-50 text-pink-800" },
  messenger: { icon: "ⓜ", label: "Messenger", className: "bg-blue-50 text-blue-800" },
  phone: { icon: "☎", label: "Phone", className: "bg-emerald-50 text-emerald-800" },
  website: { icon: "🌐", label: "Website", className: "bg-line text-heading" },
  slack: { icon: "#", label: "Slack", className: "bg-purple-50 text-purple-800" },
  messaging: { icon: "💬", label: "Messaging app", className: "bg-line text-heading" },
  hosted: { icon: "🔗", label: "ElevenLabs page / QR", className: "bg-line text-heading" },
};
export const channelStyle = (channel: string | null) =>
  CHANNEL_STYLE[channel ?? ""] ?? { icon: "•", label: channel ?? "unknown", className: "bg-line text-heading" };

const EMAIL_STATUS: Record<string, string> = {
  sent: "Replied",
  draft: "Draft ready",
  skipped: "Skipped",
  failed: "Failed",
  waiting: "Clara writing",
  replying: "Clara writing",
  new: "Clara writing",
};
const EMAIL_DOT: Record<string, string> = { sent: "bg-green-500", draft: "bg-amber-400", skipped: "bg-line", failed: "bg-brand" };

const BASE = "/admin/customers";
const OVERVIEW = `${BASE}/overview`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Which tab the address shows, and which customer (/admin/customers/<id>) is open. */
function routeOf(path: string): { view: "people" | "overview"; selected: string | null } {
  if (path === OVERVIEW || path.startsWith(`${OVERVIEW}/`)) return { view: "overview", selected: null };
  const id = path.startsWith(`${BASE}/`) ? path.slice(BASE.length + 1).split("/")[0] : "";
  return { view: "people", selected: UUID.test(id) ? id : null };
}

const when = (iso: string) =>
  new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** A customer is "known" once we have more than an anonymous browser cookie for them. */
const isKnown = (customer: CustomerSummary) =>
  Boolean(customer.name) ||
  customer.hasAccount ||
  customer.notes > 0 ||
  customer.channels.some((channel) => channel.channel !== "website");

export function CustomersPanel({ staffToken, onSignOut }: { staffToken: string; onSignOut: () => void }) {
  const [data, setData] = useState<{ customers: CustomerSummary[]; overview: Overview; loadedAt: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("known");
  const { view, selected } = routeOf(useSectionPath(BASE));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/customers", { headers: { "x-aida-staff": staffToken } });
      if (response.status === 401) return onSignOut();
      const body = (await response.json().catch(() => ({}))) as { customers?: CustomerSummary[]; overview?: Overview; error?: string };
      if (!response.ok || !body.customers || !body.overview) throw new Error(body.error ?? "Could not load the customers.");
      setData({ customers: body.customers, overview: body.overview, loadedAt: Date.now() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the customers.");
    } finally {
      setLoading(false);
    }
  }, [staffToken, onSignOut]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const visible = useMemo(() => {
    if (!data) return [];
    const weekAgo = data.loadedAt - 7 * 86_400_000;
    const term = search.trim().toLowerCase();
    return data.customers.filter((customer) => {
      if (filter === "known" && !isKnown(customer)) return false;
      if (filter === "account" && !customer.hasAccount) return false;
      if (filter === "week" && new Date(customer.lastActivity).getTime() < weekAgo) return false;
      if (!term) return true;
      return (
        (customer.name ?? "").toLowerCase().includes(term) ||
        customer.channels.some((channel) => channel.label.toLowerCase().includes(term) || channel.channel.includes(term))
      );
    });
  }, [data, filter, search]);

  const tabs: SectionTab[] = [
    { href: BASE, label: "People", icon: Users, count: data?.customers.filter(isKnown).length },
    { href: OVERVIEW, label: "Overview", icon: LayoutDashboard },
  ];

  return (
    <div className="space-y-4">
      <SectionTabs label="Customers" tabs={tabs} active={view === "overview" ? OVERVIEW : BASE} />
      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-brand-dark">{error}</p>}

      {view === "overview" ? (
        <div key="overview" className="animate-fade-up space-y-4">
          {data ? <OverviewView overview={data.overview} /> : !error && <p className="text-sm text-muted">Loading…</p>}
          <WeekInsightCard staffToken={staffToken} />
        </div>
      ) : (
        <div
          key="people"
          className="animate-fade-up grid grid-cols-1 gap-4 lg:h-[calc(100dvh-13.5rem)] lg:min-h-[520px] lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]"
        >
          <section
            className={`${selected ? "hidden lg:flex" : "flex"} max-h-[78dvh] min-h-0 flex-col overflow-hidden rounded-2xl bg-white shadow-sm lg:max-h-none`}
          >
            <div className="space-y-3 border-b border-line p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-heading">
                  {visible.length} {visible.length === 1 ? "person" : "people"}
                </p>
                <button
                  type="button"
                  onClick={() => void load()}
                  disabled={loading}
                  title="Refresh"
                  aria-label="Refresh the list"
                  className="rounded-lg p-1.5 text-muted transition hover:bg-surface hover:text-heading disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
                </button>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search a name, email, Telegram chat…"
                  aria-label="Search customers"
                  className="w-full rounded-xl border border-line bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
                />
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
                {FILTERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={filter === item.id}
                    onClick={() => setFilter(item.id)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      filter === item.id ? "bg-heading text-white" : "bg-surface text-heading hover:bg-line"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <ul className="scroll-thin min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
              {!data && !error && <li className="p-3 text-sm text-muted">Loading customers…</li>}
              {data && visible.length === 0 && <li className="p-3 text-sm text-muted">Nobody matches.</li>}
              {visible.map((customer) => {
                const isSelected = selected === customer.id;
                return (
                  <li key={customer.id}>
                    <Link
                      href={`${BASE}/${customer.id}`}
                      prefetch={false}
                      aria-current={isSelected ? "page" : undefined}
                      className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                        isSelected ? "bg-brand-soft ring-1 ring-brand/30" : "hover:bg-surface"
                      }`}
                    >
                      <Avatar name={customer.name} active={customer.activeNow} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-sm font-semibold text-heading">{customer.name ?? "Unnamed customer"}</span>
                            {customer.hasAccount && (
                              <span className="shrink-0 rounded-full bg-green-100 px-1.5 text-[10px] font-semibold text-green-800">account</span>
                            )}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted">{ago(customer.lastActivity)}</span>
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1">
                          {[...new Set(customer.channels.map((channel) => channel.channel))].map((channel) => (
                            <ChannelChip key={channel} channel={channel} />
                          ))}
                        </span>
                        <span className="mt-1 block text-[11px] text-muted">
                          {customer.conversations} chats · {customer.notes} notes
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>

          <div className={`${selected ? "flex" : "hidden lg:flex"} min-h-0 min-w-0 flex-col`}>
            {selected ? (
              <CustomerView key={selected} id={selected} staffToken={staffToken} />
            ) : (
              <div className="flex flex-1 flex-col justify-center">
                <Empty icon={IdCard} title="Pick a customer" text="Their channels, history and an AI insight appear here." />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Avatar({ name, active = false, large = false }: { name: string | null; active?: boolean; large?: boolean }) {
  const letter = name?.trim()[0]?.toUpperCase();
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-bold text-brand ${
        large ? "h-12 w-12 text-lg" : "h-9 w-9 text-sm"
      }`}
      aria-hidden="true"
    >
      {letter ?? <UserRound className={large ? "h-6 w-6" : "h-4 w-4"} />}
      {active && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 ring-2 ring-white" />}
    </span>
  );
}

function ChannelChip({ channel }: { channel: string | null }) {
  const style = channelStyle(channel);
  return (
    <span className={`shrink-0 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${style.className}`}>
      {style.icon} {style.label}
    </span>
  );
}

// --- Overview: the numbers -----------------------------------------------------------------------

function OverviewView({ overview }: { overview: Overview }) {
  const week = Object.entries(overview.conversations7Days).sort((a, b) => b[1] - a[1]);
  const emailOrder = ["sent", "draft", "skipped", "failed"];
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile icon={Users} label="Customers" value={overview.customers} />
        <StatTile icon={UserRoundCheck} label="With an NDI account" value={overview.withAccount} />
        <StatTile icon={Waypoints} label="On 2+ channels" value={overview.multiChannel} />
        <StatTile icon={Activity} label="Active this week" value={overview.active7Days} />
        <StatTile icon={Radio} label="Active now" value={overview.activeNow} note="last chat under 15 min ago" />
        <StatTile icon={Headset} label="Aida rooms open" value={overview.rooms.open} note={`${overview.rooms.closed} closed`} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Customers per channel" icon={Users}>
          <Bars values={overview.channels} />
        </Panel>
        <Panel title="Conversations this week" icon={MessagesSquare}>
          {week.length ? <Bars values={Object.fromEntries(week)} /> : <p className="text-sm text-muted">None yet.</p>}
        </Panel>
        <Panel title="Emails since the switch to Gmail" icon={Mail}>
          <ul className="space-y-2 text-sm">
            {emailOrder.map((status) => (
              <li key={status} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-muted">
                  <span className={`h-2 w-2 rounded-full ${EMAIL_DOT[status]}`} aria-hidden="true" />
                  {EMAIL_STATUS[status]}
                </span>
                <strong className="text-heading">{overview.emails[status] ?? 0}</strong>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}

function Bars({ values }: { values: Record<string, number> }) {
  const max = Math.max(1, ...Object.values(values));
  return (
    <ul className="space-y-2">
      {Object.entries(values).map(([channel, count]) => (
        <li key={channel} className="flex items-center gap-3 text-xs">
          <span className="w-24 shrink-0 truncate text-muted">{channelStyle(channel).label}</span>
          <span className="h-2.5 flex-1 rounded-full bg-surface">
            <span className="block h-2.5 rounded-full bg-brand" style={{ width: `${(count / max) * 100}%` }} />
          </span>
          <strong className="w-6 text-right text-heading">{count}</strong>
        </li>
      ))}
    </ul>
  );
}

// --- Claude on the whole week --------------------------------------------------------------------

function WeekInsightCard({ staffToken }: { staffToken: string }) {
  const [insight, setInsight] = useState<WeekInsight | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/insights", { method: "POST", headers: { "x-aida-staff": staffToken } });
      const body = (await response.json().catch(() => ({}))) as { insight?: WeekInsight; error?: string };
      if (!response.ok || !body.insight) throw new Error(body.error ?? "Could not write the summary.");
      setInsight(body.insight);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not write the summary.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="What customers asked this week"
      icon={Sparkles}
      aside={
        <button
          type="button"
          onClick={() => void ask()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full bg-heading px-4 py-2 text-xs font-semibold text-white transition hover:bg-black disabled:opacity-60"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {busy ? "Claude is reading…" : insight ? "Write it again" : "Summarise with Claude"}
        </button>
      }
    >
      {!insight && !error && (
        <p className="text-sm text-muted">Claude reads the last 7 days of conversation notes and email subjects, on every channel. Nothing is stored.</p>
      )}
      {error && <p className="text-sm text-brand-dark">{error}</p>}
      {insight && (
        <div className="space-y-4 text-sm text-heading">
          <p className="leading-relaxed">{insight.summary}</p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <InsightList title="Top topics" items={insight.topTopics} />
            <InsightList title="Common problems" items={insight.commonProblems} />
            <InsightList title="AI Employees mentioned" items={insight.products} />
            <InsightList title="Ideas for NDI" items={insight.suggestions} />
          </div>
          <p className="text-xs text-muted">Based on {insight.basedOn} conversations and emails.</p>
        </div>
      )}
    </Panel>
  );
}

function InsightList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="rounded-xl bg-surface p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</p>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

// --- one customer --------------------------------------------------------------------------------

type DetailTab = "profile" | "history" | "insight";

function CustomerView({ id, staffToken }: { id: string; staffToken: string }) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>("profile");
  const [insight, setInsight] = useState<CustomerInsight | null>(null);
  const [insightBusy, setInsightBusy] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/customers/${id}`, { headers: { "x-aida-staff": staffToken } })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as CustomerDetail & { error?: string };
        if (cancelled) return;
        if (!response.ok || !body.customer) setError(body.error ?? "Could not load this customer.");
        else setDetail(body);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this customer.");
      });
    return () => {
      cancelled = true;
    };
  }, [id, staffToken]);

  async function askInsight() {
    setInsightBusy(true);
    setInsightError(null);
    try {
      const response = await fetch(`/api/admin/customers/${id}/insight`, { method: "POST", headers: { "x-aida-staff": staffToken } });
      const body = (await response.json().catch(() => ({}))) as { insight?: CustomerInsight; error?: string };
      if (!response.ok || !body.insight) throw new Error(body.error ?? "Could not write the insight.");
      setInsight(body.insight);
    } catch (err) {
      setInsightError(err instanceof Error ? err.message : "Could not write the insight.");
    } finally {
      setInsightBusy(false);
    }
  }

  const back = (
    <Link href={BASE} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-heading lg:hidden">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> All customers
    </Link>
  );
  if (error) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        {back}
        <p className="text-sm text-brand-dark">{error}</p>
      </section>
    );
  }
  if (!detail) {
    return <section className="flex flex-1 items-center justify-center rounded-2xl bg-white p-6 text-sm text-muted shadow-sm">Loading…</section>;
  }

  const { customer } = detail;
  const perChannel = detail.conversations.reduce<Record<string, number>>((counts, conversation) => {
    const key = conversation.channel ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const timeline = [
    ...detail.notes.map((note) => ({ at: note.createdAt, channel: note.channel, text: note.summary, kind: "note" as const })),
    ...detail.emails.map((email) => ({
      at: email.createdAt,
      channel: "email",
      text: `Email "${email.subject ?? "(no subject)"}" → ${EMAIL_STATUS[email.status] ?? email.status}${email.reason ? ` (${email.reason})` : ""}`,
      kind: "email" as const,
    })),
    ...detail.rooms.map((room) => ({
      at: room.createdAt,
      channel: "aida",
      text: `Live call with NDI staff: ${room.title ?? "Aida room"} (room ${room.code})${room.closedAt ? "" : " — still open"}`,
      kind: "room" as const,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const tabs: { id: DetailTab; label: string; icon: typeof IdCard; count?: number }[] = [
    { id: "profile", label: "Profile", icon: IdCard },
    { id: "history", label: "History", icon: History, count: timeline.length },
    { id: "insight", label: "AI insight", icon: Sparkles },
  ];

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-sm">
      <header className="border-b border-line p-4 sm:p-5">
        {back}
        <div className="flex flex-wrap items-start gap-3">
          <Avatar name={customer.name} active={customer.activeNow} large />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold tracking-tight text-heading">{customer.name ?? "Unnamed customer"}</h2>
            <p className="text-xs text-muted">
              First seen {when(customer.createdAt)} · last active {ago(customer.lastActivity)}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {customer.activeNow && (
              <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">● Active now</span>
            )}
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${customer.hasAccount ? "bg-green-100 text-green-800" : "bg-surface text-heading"}`}
            >
              {customer.hasAccount ? "NDI account" : "No account"}
            </span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat label="Conversations" value={detail.conversations.length} />
          <MiniStat label="Memory notes" value={detail.notes.length} />
          <MiniStat label="Emails" value={detail.emails.length} />
          <MiniStat label="Live calls" value={detail.rooms.length} />
        </div>
        <div role="tablist" aria-label="About this customer" className="mt-4 flex gap-1 overflow-x-auto rounded-xl bg-surface p-1">
          {tabs.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
                  active ? "bg-white text-heading shadow-sm" : "text-muted hover:text-heading"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
                {item.count !== undefined && <span className="text-[11px] font-bold text-muted">{item.count}</span>}
              </button>
            );
          })}
        </div>
      </header>

      <div key={tab} className="animate-fade-up scroll-thin min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        {tab === "profile" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-line p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Channels</p>
                {customer.channels.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">None linked.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {customer.channels.map((channel) => (
                      <li key={`${channel.channel}-${channel.label}`} className="flex min-w-0 items-center gap-2 text-sm">
                        <ChannelChip channel={channel.channel} />
                        <span className="min-w-0 truncate text-heading">{channel.label}</span>
                        {channel.verified && (
                          <span className="text-xs text-green-700" title="Verified">
                            ✓
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-xl border border-line p-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Conversations by channel</p>
                {Object.keys(perChannel).length ? <Bars values={perChannel} /> : <p className="text-sm text-muted">None yet.</p>}
              </div>
            </div>
            <MoodStrip conversations={detail.conversations} />
          </div>
        )}

        {tab === "history" &&
          (timeline.length === 0 ? (
            <Empty icon={History} title="Nothing recorded yet" text="Memory notes, emails and live calls appear here." />
          ) : (
            <ol className="relative ml-1.5 space-y-4 border-l-2 border-line pl-5">
              {timeline.slice(0, 40).map((item, index) => (
                <li key={`${item.at}-${index}`} className="relative">
                  <span
                    className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-white ${
                      item.kind === "note" ? "bg-brand" : item.kind === "email" ? "bg-sky-500" : "bg-heading"
                    }`}
                    aria-hidden="true"
                  />
                  <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                    {when(item.at)} ·{" "}
                    {item.kind === "room" ? (
                      <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-heading">Aida room</span>
                    ) : (
                      <ChannelChip channel={item.channel} />
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-heading">
                    <LinkedText text={item.text} previews={false} />
                  </p>
                </li>
              ))}
            </ol>
          ))}

        {tab === "insight" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface p-4">
              <p className="max-w-md text-sm text-muted">
                Claude reads this customer&apos;s notes, emails, calls and last few transcripts. Nothing is stored.
              </p>
              <button
                type="button"
                onClick={() => void askInsight()}
                disabled={insightBusy}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                {insightBusy ? "Claude is reading…" : insight ? "Write it again" : "Ask Claude"}
              </button>
            </div>
            {insightError && <p className="text-sm text-brand-dark">{insightError}</p>}
            {insight && (
              <div className="space-y-4 text-sm text-heading">
                <p className="leading-relaxed">{insight.summary}</p>
                <p className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      insight.sentiment === "positive"
                        ? "bg-green-100 text-green-800"
                        : insight.sentiment === "negative"
                          ? "bg-red-100 text-brand-dark"
                          : "bg-surface text-heading"
                    }`}
                  >
                    Mood: {insight.sentiment}
                  </span>
                  <span className="text-xs text-muted">{insight.sentimentReason}</span>
                </p>
                {insight.flags.length > 0 && (
                  <p className="flex flex-wrap gap-1.5">
                    {insight.flags.map((flag) => (
                      <span key={flag} className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-brand-dark">
                        <TriangleAlert className="h-3 w-3" aria-hidden="true" /> {flag}
                      </span>
                    ))}
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <InsightList title="Topics" items={insight.topics} />
                  <InsightList title="AI Employees and services" items={insight.products} />
                  <InsightList title="Not resolved yet" items={insight.openIssues} />
                </div>
                {insight.nextAction && (
                  <p className="rounded-xl border border-brand/20 bg-brand-soft px-4 py-3">
                    <strong>Next step for staff:</strong> {insight.nextAction}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-surface px-3 py-2">
      <p className="text-lg font-bold leading-tight text-heading">{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
}

const MOOD_DOT: Record<"positive" | "neutral" | "negative", { color: string; word: string }> = {
  positive: { color: "#2a78d6", word: "Positive" },
  neutral: { color: "#b4b2ab", word: "Neutral" },
  negative: { color: "#d03d3b", word: "Negative" },
};

/** One dot per conversation ElevenLabs scored, oldest to newest, with the counts beside them. */
function MoodStrip({ conversations }: { conversations: CustomerDetail["conversations"] }) {
  const scored = conversations.filter((conversation) => conversation.mood).reverse();
  const count = (label: "positive" | "neutral" | "negative") => scored.filter((c) => c.mood?.label === label).length;
  const upset = scored.filter((c) => c.mood?.upset).length;
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Measured mood</p>
        {scored.length > 0 && (
          <p className="flex flex-wrap items-center gap-3 text-xs text-muted">
            {(["positive", "neutral", "negative"] as const).map((label) => (
              <span key={label} className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: MOOD_DOT[label].color }} aria-hidden="true" />
                {MOOD_DOT[label].word} {count(label)}
              </span>
            ))}
            {upset > 0 && <span className="font-semibold text-brand-dark">Upset {upset}</span>}
          </p>
        )}
      </div>
      {scored.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No scored conversation yet. ElevenLabs scores each conversation when it ends.</p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted">Oldest</span>
          {scored.map((conversation) => (
            <span
              key={conversation.id}
              className={`inline-block h-3.5 w-3.5 rounded-full ring-2 ${conversation.mood?.upset ? "ring-brand/40" : "ring-white"}`}
              style={{ backgroundColor: MOOD_DOT[conversation.mood!.label].color }}
              title={`${when(conversation.createdAt)} · ${channelStyle(conversation.channel).label} · ${MOOD_DOT[conversation.mood!.label].word} · frustration ${Math.round(conversation.mood!.frustration * 100)}%`}
            />
          ))}
          <span className="text-[11px] text-muted">newest</span>
        </div>
      )}
    </div>
  );
}
