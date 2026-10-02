"use client";

import { useCallback, useEffect, useState } from "react";
import { channelStyle } from "./CustomersPanel";

// /admin → 😊 Mood: how customers felt talking to Clara, on every channel. The scores come from
// ElevenLabs (sentiment -1…+1 and frustration 0…100% per conversation and per customer message);
// emails and Aida rooms are rated by Claude as they happen.
//
// Colours are the diverging pair validated for colour blindness: blue positive, grey neutral, red
// negative. Every chart has a legend and its numbers in the tooltip and beside the bars, so colour is
// never the only signal.

type Label = "positive" | "neutral" | "negative";
type Counts = { total: number; positive: number; neutral: number; negative: number };
type Turn = { at: number; excerpt: string; score: number; frustration: number };
type Unhappy = {
  conversationId: string;
  channel: string;
  customerId: string | null;
  customerName: string | null;
  startedAt: string;
  label: Label;
  score: number;
  frustration: number;
  peakFrustration: number;
  lowPoint: string | null;
  title: string | null;
  summary: string | null;
  followUp: boolean;
  alerted: boolean;
  handledAt: string | null;
  handledBy: string | null;
  turns: Turn[];
};
type Overview = {
  days: number;
  counts: Counts;
  averageScore: number | null;
  averageFrustration: number | null;
  byChannel: (Counts & { channel: string; averageFrustration: number })[];
  byDay: (Counts & { date: string })[];
  unhappy: Unhappy[];
  emails: {
    checked: number;
    upset: number;
    mailbox: string | null;
    items: { threadId: string; from: string | null; subject: string | null; reason: string | null; frustration: number; status: string; receivedAt: string }[];
  };
  aida: {
    lines: number;
    frustrated: number;
    items: { roomCode: string | null; roomTitle: string | null; excerpt: string | null; label: Label; frustration: number; at: string }[];
  };
  alertsOn: boolean;
  alerts?: { on: true; to: string[] } | { on: false; reason: "mail_not_configured" | "no_address" | "invalid_address" };
};

/** Why alerts are off, in words staff can act on. */
const ALERTS_OFF: Record<string, string> = {
  no_address: "STAFF_ALERT_EMAIL is empty on this deployment: add it in Railway (the service → Variables); Railway redeploys by itself.",
  invalid_address: "STAFF_ALERT_EMAIL does not look like an email address. Write it plainly (name@example.com; several separated by commas).",
  mail_not_configured: "The mailbox that sends emails (gmail_sender and gmail_app_password) is not set on this deployment.",
};

const COLOR: Record<Label, string> = { positive: "#2a78d6", neutral: "#b4b2ab", negative: "#d03d3b" };
const WORD: Record<Label, string> = { positive: "Positive", neutral: "Neutral", negative: "Negative" };
const ORDER: Label[] = ["positive", "neutral", "negative"];

const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);

/** What happened to an upset email, in staff words. */
const EMAIL_STATUS: Record<string, string> = {
  draft: "Draft waiting in Gmail",
  sent: "Replied",
  skipped: "Skipped",
  failed: "Failed",
  new: "Clara writing",
  waiting: "Clara writing",
  replying: "Clara writing",
};
const when = (iso: string) =>
  new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const dayLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString([], { day: "numeric", month: "short" });

type Tip = { x: number; y: number; text: string } | null;

export function MoodPanel({ staffToken, onSignOut }: { staffToken: string; onSignOut: () => void }) {
  const [days, setDays] = useState<7 | 30>(7);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [staffName, setStaffName] = useState("");
  const [tip, setTip] = useState<Tip>(null);

  const call = useCallback(
    async (init?: RequestInit, query = "") => {
      const response = await fetch(`/api/admin/mood${query}`, {
        ...init,
        headers: { "x-aida-staff": staffToken, "Content-Type": "application/json" },
      });
      if (response.status === 401) {
        onSignOut();
        return null;
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((body as { error?: string }).error ?? "Something went wrong.");
      return body;
    },
    [staffToken, onSignOut],
  );

  const load = useCallback(async () => {
    try {
      const body = (await call(undefined, `?days=${days}`)) as Overview | null;
      if (body) {
        setData(body);
        setError(null);
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not load the moods.");
    }
  }, [call, days]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the state is set once the fetch resolves
    void load();
  }, [load]);

  async function importPast() {
    setImporting(true);
    setImportNote(null);
    try {
      const result = (await call({ method: "POST", body: JSON.stringify({ action: "import" }) })) as { checked: number; added: number } | null;
      if (result) setImportNote(`Checked ${result.checked} conversations from the last 30 days, added ${result.added}.`);
      await load();
    } catch (problem) {
      setImportNote(problem instanceof Error ? problem.message : "The import did not work.");
    } finally {
      setImporting(false);
    }
  }

  async function setHandled(conversationId: string, handled: boolean) {
    try {
      await call({ method: "POST", body: JSON.stringify({ action: "handled", conversationId, handled, by: staffName }) });
      await load();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That did not work.");
    }
  }

  const showTip = (event: React.MouseEvent, text: string) => setTip({ x: event.clientX, y: event.clientY, text });

  return (
    <div className="space-y-4" onMouseLeave={() => setTip(null)}>
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-heading">😊 Customer mood</h2>
          <p className="text-xs text-muted">
            ElevenLabs scores every conversation with Clara when it ends; Claude rates emails and Aida calls as they happen.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full bg-line p-1" role="group" aria-label="Period">
            {([7, 30] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={days === option}
                onClick={() => setDays(option)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${days === option ? "bg-white text-heading shadow-sm" : "text-muted"}`}
              >
                {option} days
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void importPast()}
            disabled={importing}
            className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-heading disabled:opacity-60"
            title="Reads the last 30 days of conversations from ElevenLabs (free) and adds any that are missing"
          >
            {importing ? "Importing…" : "⟳ Import past conversations"}
          </button>
        </div>
      </section>

      {importNote && <p className="rounded-xl bg-white px-4 py-2 text-sm text-heading shadow-sm">{importNote}</p>}
      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-brand-dark">{error}</p>}
      {!data && !error && <p className="rounded-xl bg-white p-4 text-sm text-muted shadow-sm">Loading…</p>}

      {data && (
        <>
          <p className={`rounded-xl px-4 py-2 text-xs ${data.alertsOn ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-900"}`}>
            {data.alerts?.on
              ? `Staff alerts are on: an email goes to ${data.alerts.to.join(", ")} when a customer is upset or Clara promised a follow-up.`
              : `Staff alerts are off. ${
                  data.alerts && !data.alerts.on ? ALERTS_OFF[data.alerts.reason] : ALERTS_OFF.no_address
                } Unhappy conversations are still listed below.`}
          </p>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Tile label="Conversations scored" value={String(data.counts.total)} />
            {ORDER.map((label) => (
              <Tile
                key={label}
                label={WORD[label]}
                value={`${pct(data.counts[label], data.counts.total)}%`}
                note={`${data.counts[label]} conversations`}
                swatch={COLOR[label]}
              />
            ))}
            <Tile
              label="Average frustration"
              value={data.averageFrustration === null ? "–" : `${Math.round(data.averageFrustration * 100)}%`}
            />
            <Tile
              label="Waiting for follow-up"
              value={String(data.unhappy.filter((item) => !item.handledAt).length)}
              note={`of ${data.unhappy.length} unhappy`}
              alert={data.unhappy.some((item) => !item.handledAt)}
            />
          </section>

          {data.counts.total === 0 ? (
            <p className="rounded-xl bg-white p-4 text-sm text-muted shadow-sm">
              No scored conversations in this period yet. Use “Import past conversations” to fill in the last 30 days.
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-xl bg-white p-4 shadow-sm">
                <ChartTitle title="Mood by channel" />
                <ul className="mt-3 space-y-2.5">
                  {data.byChannel.map((row) => (
                    <li key={row.channel} className="grid grid-cols-[110px_1fr_70px] items-center gap-3 text-sm">
                      <span className="truncate text-heading">
                        {channelStyle(row.channel).icon} {channelStyle(row.channel).label}
                      </span>
                      <div
                        className={`flex h-4 gap-[2px] ${row.total === 0 ? "rounded bg-surface" : ""}`}
                        aria-label={`${channelStyle(row.channel).label}: ${row.total === 0 ? "no conversations" : ORDER.map((l) => `${row[l]} ${l}`).join(", ")}`}
                        title={row.total === 0 ? "No conversations in this period" : undefined}
                      >
                        {ORDER.filter((label) => row[label] > 0).map((label) => (
                          <div
                            key={label}
                            className="h-full first:rounded-l last:rounded-r"
                            style={{ width: `${pct(row[label], row.total)}%`, backgroundColor: COLOR[label] }}
                            onMouseMove={(event) =>
                              showTip(event, `${channelStyle(row.channel).label} · ${WORD[label]}: ${row[label]} of ${row.total} (${pct(row[label], row.total)}%)`)
                            }
                            onMouseLeave={() => setTip(null)}
                          />
                        ))}
                      </div>
                      <span className="text-right text-xs text-muted" title="Average frustration">
                        {row.total === 0 ? "0 · –" : `${row.total} · ${Math.round(row.averageFrustration * 100)}%`}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[11px] text-muted">Right: conversations · average frustration.</p>
              </section>

              <section className="rounded-xl bg-white p-4 shadow-sm">
                <ChartTitle title={`Conversations per day, last ${data.days} days`} />
                <DayColumns days={data.byDay} onTip={showTip} onLeave={() => setTip(null)} />
              </section>
            </div>
          )}

          <section className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-heading">✉️ Emails checked before Clara answered</p>
              <p className="mt-1 text-sm text-heading">
                {data.emails.checked} checked · <strong className="text-brand-dark">{data.emails.upset} upset</strong>
              </p>
              <p className="mt-1 text-xs text-muted">
                An upset email is never answered automatically: Clara leaves a Gmail draft labelled “Clara/Upset customer”.
              </p>
              {data.emails.items.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {data.emails.items.map((email) => (
                    <li key={`${email.threadId}-${email.receivedAt}`} className="rounded-lg bg-surface px-3 py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-semibold text-heading">{email.from ?? "Unknown sender"}</span>
                        <span className="shrink-0 text-[11px] text-muted">{when(email.receivedAt)}</span>
                      </div>
                      <p className="truncate text-xs text-heading">{email.subject || "(no subject)"}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: COLOR.negative }} aria-hidden="true" />
                        Frustration {Math.round(email.frustration * 100)}%{email.reason ? ` · ${email.reason}` : ""} ·{" "}
                        {EMAIL_STATUS[email.status] ?? email.status} ·{" "}
                        <a
                          href={`https://mail.google.com/mail/?authuser=${encodeURIComponent(data.emails.mailbox ?? "")}#all/${email.threadId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          Open in Gmail
                        </a>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-heading">📞 Aida calls, live</p>
              <p className="mt-1 text-sm text-heading">
                {data.aida.lines} customer lines rated · <strong className="text-brand-dark">{data.aida.frustrated} frustrated</strong>
              </p>
              <p className="mt-1 text-xs text-muted">
                Staff see the mood of each line in the room; when the customer is frustrated, Aida’s next draft opens with an apology.
              </p>
              {data.aida.items.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {data.aida.items.map((line, index) => (
                    <li key={`${line.at}-${index}`} className="rounded-lg bg-surface px-3 py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-semibold text-heading">
                          {line.roomTitle ?? "Aida room"}
                          {line.roomCode ? <span className="font-normal text-muted"> · room {line.roomCode}</span> : null}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted">{when(line.at)}</span>
                      </div>
                      {line.excerpt && <p className="text-xs text-heading">“{line.excerpt}”</p>}
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: COLOR[line.label] }} aria-hidden="true" />
                        {WORD[line.label]}, frustration {Math.round(line.frustration * 100)}%
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold text-heading">Unhappy conversations</h3>
                <p className="text-xs text-muted">
                  Upset customers (frustration 60%+ or a very negative moment) and everyone Clara promised a follow-up, newest first.
                </p>
              </div>
              <label className="text-xs text-muted">
                Your name{" "}
                <input
                  value={staffName}
                  onChange={(event) => setStaffName(event.target.value)}
                  placeholder="for “followed up by”"
                  className="ml-1 w-44 rounded-full border border-line px-3 py-1 text-xs"
                />
              </label>
            </div>
            {data.unhappy.length === 0 ? (
              <p className="mt-3 rounded-lg bg-surface p-3 text-sm text-muted">Nobody was unhappy in this period. 🎉</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {data.unhappy.map((item) => (
                  <UnhappyCard key={item.conversationId} item={item} onHandled={setHandled} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {tip && (
        <div
          className="pointer-events-none fixed z-50 max-w-xs rounded-lg bg-heading px-2.5 py-1.5 text-xs text-white shadow-lg"
          style={{ left: tip.x + 12, top: tip.y + 12 }}
          role="tooltip"
        >
          {tip.text}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, note, swatch, alert }: { label: string; value: string; note?: string; swatch?: string; alert?: boolean }) {
  return (
    <div className={`rounded-xl bg-white p-3 shadow-sm ${alert ? "ring-1 ring-brand/50" : ""}`}>
      <p className="flex items-center gap-1.5 text-xs text-muted">
        {swatch && <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: swatch }} aria-hidden="true" />}
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-heading">{value}</p>
      {note && <p className="text-[11px] text-muted">{note}</p>}
    </div>
  );
}

function ChartTitle({ title }: { title: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-heading">{title}</h3>
      <p className="flex gap-3 text-[11px] text-muted">
        {ORDER.map((label) => (
          <span key={label} className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COLOR[label] }} aria-hidden="true" />
            {WORD[label]}
          </span>
        ))}
      </p>
    </div>
  );
}

/** Stacked columns: negative at the bottom, then neutral, positive on top; a 2px gap between parts. */
function DayColumns({
  days,
  onTip,
  onLeave,
}: {
  days: (Counts & { date: string })[];
  onTip: (event: React.MouseEvent, text: string) => void;
  onLeave: () => void;
}) {
  const max = Math.max(1, ...days.map((day) => day.total));
  const every = days.length > 10 ? 5 : 1;
  return (
    <div className="mt-3">
      <div className="flex h-40 items-end gap-[2px] border-b border-line">
        {days.map((day) => (
          <div
            key={day.date}
            className="flex h-full flex-1 flex-col-reverse gap-[2px]"
            onMouseMove={(event) =>
              onTip(event, `${dayLabel(day.date)}: ${day.total} conversations · ${day.positive} positive, ${day.neutral} neutral, ${day.negative} negative`)
            }
            onMouseLeave={onLeave}
          >
            {(["negative", "neutral", "positive"] as const)
              .filter((label) => day[label] > 0)
              .map((label, index, shown) => (
                <div
                  key={label}
                  className={index === shown.length - 1 ? "rounded-t" : ""}
                  style={{ height: `${(day[label] / max) * 100}%`, backgroundColor: COLOR[label] }}
                />
              ))}
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px] text-[10px] text-muted">
        {days.map((day, index) => (
          <span key={day.date} className="flex-1 truncate text-center">
            {index % every === 0 || index === days.length - 1 ? dayLabel(day.date) : ""}
          </span>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted">Tallest day: {max} conversations.</p>
    </div>
  );
}

/** How the customer's mood moved message by message (-1 at the bottom, +1 at the top). */
function MoodCurve({ turns }: { turns: Turn[] }) {
  if (turns.length < 2) return null;
  const width = 160;
  const height = 40;
  const x = (index: number) => 4 + (index / (turns.length - 1)) * (width - 8);
  const y = (score: number) => 4 + ((1 - score) / 2) * (height - 8);
  const low = turns.reduce((lowest, turn, index) => (turn.score < turns[lowest].score ? index : lowest), 0);
  return (
    <svg width={width} height={height} className="shrink-0" role="img" aria-label="Mood during the conversation">
      <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke="#e5e5e5" strokeWidth={1} />
      <polyline
        points={turns.map((turn, index) => `${x(index)},${y(turn.score)}`).join(" ")}
        fill="none"
        stroke="#525252"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {turns.map((turn, index) => (
        <circle
          key={index}
          cx={x(index)}
          cy={y(turn.score)}
          r={index === low ? 4.5 : 3}
          fill={turn.score <= -0.2 ? COLOR.negative : turn.score >= 0.2 ? COLOR.positive : COLOR.neutral}
          stroke="#ffffff"
          strokeWidth={2}
        >
          <title>{`Message ${index + 1}: sentiment ${turn.score.toFixed(1)}, frustration ${Math.round(turn.frustration * 100)}% — “${turn.excerpt}”`}</title>
        </circle>
      ))}
    </svg>
  );
}

function UnhappyCard({ item, onHandled }: { item: Unhappy; onHandled: (id: string, handled: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const channel = channelStyle(item.channel);
  return (
    <li className={`rounded-lg border p-3 ${item.handledAt ? "border-line bg-surface" : "border-brand/40"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${channel.className}`}>
              {channel.icon} {channel.label}
            </span>
            <span className="font-semibold text-heading">{item.customerName ?? "Customer not identified"}</span>
            <span className="text-muted">· {when(item.startedAt)}</span>
            <span className="inline-flex items-center gap-1 text-muted">
              · <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: COLOR[item.label] }} aria-hidden="true" />
              {WORD[item.label]}, frustration up to {Math.round(item.peakFrustration * 100)}%
            </span>
            {item.followUp && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">Follow-up promised</span>}
            {item.alerted && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-800">Staff emailed</span>}
          </p>
          <p className="mt-1 text-sm font-semibold text-heading">{item.title ?? "Conversation"}</p>
          {item.lowPoint && (
            <p className="mt-1 text-sm text-heading">
              <span className="text-xs text-muted">Where it turned: </span>“{item.lowPoint}”
            </p>
          )}
          {item.summary && (
            <button type="button" onClick={() => setOpen(!open)} className="mt-1 text-xs text-muted underline">
              {open ? "Hide summary" : "Show summary"}
            </button>
          )}
          {open && item.summary && <p className="mt-1 text-sm text-ink">{item.summary}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <MoodCurve turns={item.turns} />
          {item.handledAt ? (
            <p className="text-xs text-green-800">
              ✓ Followed up{item.handledBy ? ` by ${item.handledBy}` : ""}{" "}
              <button type="button" onClick={() => onHandled(item.conversationId, false)} className="text-muted underline">
                undo
              </button>
            </p>
          ) : (
            <button
              type="button"
              onClick={() => onHandled(item.conversationId, true)}
              className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white"
            >
              Mark followed up
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
