"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
  intercom: { icon: "◌", label: "Intercom", className: "bg-indigo-50 text-indigo-800" },
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
  const [selected, setSelected] = useState<string | null>(null);

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

  return (
    <div className="space-y-4">
      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-brand-dark">{error}</p>}
      {data && <OverviewCards overview={data.overview} />}
      <WeekInsightCard staffToken={staffToken} />

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <section className="flex max-h-[75dvh] flex-col rounded-xl bg-white shadow-sm">
          <div className="space-y-2 border-b border-line p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-heading">
                Customers <span className="text-sm font-normal text-muted">({visible.length})</span>
              </h2>
              <button type="button" onClick={() => void load()} disabled={loading} className="text-xs text-muted underline disabled:opacity-50">
                {loading ? "Loading…" : "Refresh"}
              </button>
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search a name, email, Telegram chat…"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    filter === item.id ? "bg-heading text-white" : "bg-surface text-heading"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <ul className="flex-1 space-y-1 overflow-y-auto p-2">
            {!data && !error && <li className="p-3 text-sm text-muted">Loading customers…</li>}
            {data && visible.length === 0 && <li className="p-3 text-sm text-muted">Nobody matches.</li>}
            {visible.map((customer) => (
              <li key={customer.id}>
                <button
                  type="button"
                  onClick={() => setSelected(customer.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left transition ${
                    selected === customer.id ? "bg-red-50 ring-1 ring-brand/40" : "hover:bg-surface"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {customer.activeNow && <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" title="Active now" />}
                      <span className="truncate text-sm font-semibold text-heading">{customer.name ?? "Unnamed customer"}</span>
                      {customer.hasAccount && (
                        <span className="shrink-0 rounded-full bg-green-100 px-1.5 text-[10px] font-semibold text-green-800">account</span>
                      )}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted">{ago(customer.lastActivity)}</span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1">
                    {[...new Set(customer.channels.map((channel) => channel.channel))].map((channel) => (
                      <span key={channel} className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${channelStyle(channel).className}`}>
                        {channelStyle(channel).icon} {channelStyle(channel).label}
                      </span>
                    ))}
                    <span className="text-[11px] text-muted">
                      · {customer.conversations} chats · {customer.notes} notes
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {selected ? (
          <CustomerView key={selected} id={selected} staffToken={staffToken} />
        ) : (
          <section className="flex items-center justify-center rounded-xl bg-white p-8 text-sm text-muted shadow-sm">
            Pick a customer to see their channels, history and an AI insight.
          </section>
        )}
      </div>
    </div>
  );
}

// --- the numbers at the top ----------------------------------------------------------------------

function OverviewCards({ overview }: { overview: Overview }) {
  const stats: [string, number | string, string?][] = [
    ["Customers", overview.customers],
    ["With an NDI account", overview.withAccount],
    ["On 2+ channels", overview.multiChannel],
    ["Active this week", overview.active7Days],
    ["Active now", overview.activeNow, "last chat under 15 min ago"],
    ["Aida rooms open", overview.rooms.open, `${overview.rooms.closed} closed`],
  ];
  const week = Object.entries(overview.conversations7Days).sort((a, b) => b[1] - a[1]);
  const emailOrder = ["sent", "draft", "skipped", "failed"];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(([label, value, hint]) => (
          <div key={label} className="rounded-xl bg-white p-3 shadow-sm" title={hint}>
            <p className="text-2xl font-bold text-heading">{value}</p>
            <p className="text-xs text-muted">{label}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <p className="text-xs font-semibold text-heading">Customers per channel</p>
          <Bars values={overview.channels} />
        </div>
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <p className="text-xs font-semibold text-heading">Conversations this week</p>
          {week.length ? <Bars values={Object.fromEntries(week)} /> : <p className="mt-2 text-xs text-muted">None yet.</p>}
        </div>
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <p className="text-xs font-semibold text-heading">Emails since the switch to Gmail</p>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {emailOrder.map((status) => (
              <li key={status} className="flex justify-between">
                <span>{EMAIL_STATUS[status]}</span>
                <strong className="text-heading">{overview.emails[status] ?? 0}</strong>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Bars({ values }: { values: Record<string, number> }) {
  const max = Math.max(1, ...Object.values(values));
  return (
    <ul className="mt-2 space-y-1.5">
      {Object.entries(values).map(([channel, count]) => (
        <li key={channel} className="flex items-center gap-2 text-xs">
          <span className="w-20 shrink-0 text-muted">{channelStyle(channel).label}</span>
          <span className="h-2 flex-1 rounded-full bg-surface">
            <span className="block h-2 rounded-full bg-brand" style={{ width: `${(count / max) * 100}%` }} />
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
    <section className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-heading">What customers asked this week</h2>
          <p className="text-xs text-muted">Claude reads the last 7 days of conversation notes and email subjects, on every channel.</p>
        </div>
        <button
          type="button"
          onClick={() => void ask()}
          disabled={busy}
          className="rounded-full bg-heading px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Claude is reading…" : insight ? "✨ Write it again" : "✨ Summarise with Claude"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-brand">{error}</p>}
      {insight && (
        <div className="mt-3 space-y-3 text-sm text-heading">
          <p>{insight.summary}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <InsightList title="Top topics" items={insight.topTopics} />
            <InsightList title="Common problems" items={insight.commonProblems} />
            <InsightList title="AI Employees mentioned" items={insight.products} />
            <InsightList title="Ideas for NDI" items={insight.suggestions} />
          </div>
          <p className="text-xs text-muted">Based on {insight.basedOn} conversations and emails.</p>
        </div>
      )}
    </section>
  );
}

function InsightList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-muted">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

// --- one customer --------------------------------------------------------------------------------

function CustomerView({ id, staffToken }: { id: string; staffToken: string }) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  if (error) return <section className="rounded-xl bg-white p-6 text-sm text-brand shadow-sm">{error}</section>;
  if (!detail) return <section className="rounded-xl bg-white p-6 text-sm text-muted shadow-sm">Loading…</section>;

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

  return (
    <section className="max-h-[75dvh] space-y-4 overflow-y-auto rounded-xl bg-white p-5 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-heading">{customer.name ?? "Unnamed customer"}</h2>
          <p className="text-xs text-muted">
            First seen {when(customer.createdAt)} · last active {ago(customer.lastActivity)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {customer.activeNow && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">● Active now</span>}
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${customer.hasAccount ? "bg-green-100 text-green-800" : "bg-line text-heading"}`}
          >
            {customer.hasAccount ? "NDI account" : "No account"}
          </span>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold text-muted">Channels</p>
          <ul className="mt-1 space-y-1">
            {customer.channels.map((channel) => (
              <li key={`${channel.channel}-${channel.label}`} className="flex items-center gap-2 text-sm">
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${channelStyle(channel.channel).className}`}>
                  {channelStyle(channel.channel).icon} {channelStyle(channel.channel).label}
                </span>
                <span className="min-w-0 truncate text-heading">{channel.label}</span>
                {channel.verified && <span className="text-xs text-green-700" title="Verified">✓</span>}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted">Activity</p>
          <ul className="mt-1 space-y-0.5 text-sm text-heading">
            <li>
              {detail.conversations.length} conversations
              {Object.keys(perChannel).length > 0 &&
                ` (${Object.entries(perChannel).map(([channel, count]) => `${channelStyle(channel).label} ${count}`).join(", ")})`}
            </li>
            <li>{detail.notes.length} memory notes</li>
            <li>{detail.emails.length} emails since the switch to Gmail</li>
            <li>{detail.rooms.length} live calls with staff</li>
          </ul>
        </div>
      </div>

      <MoodStrip conversations={detail.conversations} />

      <div className="rounded-xl border border-line p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-heading">AI insight</p>
          <button
            type="button"
            onClick={() => void askInsight()}
            disabled={insightBusy}
            className="rounded-full bg-brand px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            {insightBusy ? "Claude is reading…" : insight ? "✨ Write it again" : "✨ Ask Claude"}
          </button>
        </div>
        {insightError && <p className="mt-2 text-sm text-brand">{insightError}</p>}
        {!insight && !insightError && !insightBusy && (
          <p className="mt-1 text-xs text-muted">Claude reads this customer&apos;s notes, emails, calls and last few transcripts. Nothing is stored.</p>
        )}
        {insight && (
          <div className="mt-3 space-y-3 text-sm text-heading">
            <p>{insight.summary}</p>
            <p className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  insight.sentiment === "positive"
                    ? "bg-green-100 text-green-800"
                    : insight.sentiment === "negative"
                      ? "bg-red-100 text-brand-dark"
                      : "bg-line text-heading"
                }`}
              >
                Mood: {insight.sentiment}
              </span>
              <span className="text-xs text-muted">{insight.sentimentReason}</span>
            </p>
            {insight.flags.length > 0 && (
              <p className="flex flex-wrap gap-1.5">
                {insight.flags.map((flag) => (
                  <span key={flag} className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-brand-dark">
                    ⚠ {flag}
                  </span>
                ))}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <InsightList title="Topics" items={insight.topics} />
              <InsightList title="AI Employees and services" items={insight.products} />
              <InsightList title="Not resolved yet" items={insight.openIssues} />
            </div>
            {insight.nextAction && (
              <p className="rounded-lg bg-surface px-3 py-2">
                <strong>Next step for staff:</strong> {insight.nextAction}
              </p>
            )}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-muted">History</p>
        {timeline.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Nothing recorded yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {timeline.slice(0, 40).map((item, index) => (
              <li key={`${item.at}-${index}`} className="rounded-lg bg-surface px-3 py-2">
                <p className="text-[11px] text-muted">
                  {when(item.at)} · {item.kind === "room" ? "Aida room" : channelStyle(item.channel).label}
                </p>
                <p className="text-sm text-heading">{item.text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
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
    <div className="rounded-xl border border-line px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-heading">Measured mood</p>
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
        <p className="mt-1 text-xs text-muted">No scored conversation yet. ElevenLabs scores each conversation when it ends.</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
