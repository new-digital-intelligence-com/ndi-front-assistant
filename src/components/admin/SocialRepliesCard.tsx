"use client";

import { Camera, Check, CircleCheck, Clock, MessageCircle, Send, Trash2, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { savedName } from "../aida/types";
import { LinkedText } from "../LinkedText";
import { ChannelLayout, ChannelPanel, Empty, ListPanel, ModeBadge, ModeSwitch, Panel } from "./ui";

// The Instagram and Messenger tabs of /admin/replies (src/lib/socialDrafts.ts), each at its own address (the
// user's request, 4 Oct 2026): Clara's answers go out straight away or wait as drafts. Staff read the
// customer's message, change the draft if needed and send it, or discard it. Meta only takes a reply within
// 24 hours of the customer's last message. One component serves both tabs, so a draft being changed is kept
// while staff look at the other one.

type Mode = "auto" | "draft";
export type Channel = "instagram" | "messenger";

type Draft = {
  id: number;
  channel: Channel;
  customer_name: string | null;
  question: string | null;
  reply: string;
  status: "pending" | "sending" | "sent" | "discarded" | "failed";
  sent_text: string | null;
  error: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  lateAt?: string;
};

type State = {
  channels: Record<Channel, { configured: boolean; mode: Mode }>;
  waiting: Draft[];
  decided: Draft[];
};

const REFRESH_MS = 10_000;
const CHANNEL: Record<Channel, { label: string; icon: LucideIcon; where: string }> = {
  instagram: { label: "Instagram", icon: Camera, where: "Direct messages to @new_digital_intelligence" },
  messenger: { label: "Messenger", icon: MessageCircle, where: "Messages to the Facebook Page “New Digital Intelligence”" },
};
const LABEL = "text-[11px] font-semibold uppercase tracking-wide text-muted";

const when = (iso: string) =>
  new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const initial = (name: string | null) => name?.match(/[\p{L}\p{N}]/u)?.[0] ?? "?";

export function SocialRepliesCard({
  staffToken,
  onSignOut,
  channel,
  onWaiting,
}: {
  staffToken: string;
  onSignOut: () => void;
  /** The channel on screen: its tab on /admin/replies. */
  channel: Channel;
  /** How many drafts wait on each channel, for the tabs' counts. */
  onWaiting?: (waiting: Record<Channel, number>) => void;
}) {
  const [state, setState] = useState<State | null>(null);
  const [texts, setTexts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Why the tab could not load, shown instead of it (e.g. supabase/schema.sql not run again yet). */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const call = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const response = await fetch(path, {
        ...init,
        headers: { "Content-Type": "application/json", "x-aida-staff": staffToken },
        cache: "no-store",
      });
      if (response.status === 401) {
        onSignOut();
        return null;
      }
      const body = (await response.json().catch(() => ({}))) as Partial<State> & { state?: State; error?: string };
      const next = body.state ?? (body.channels ? (body as State) : null);
      if (next) {
        setState(next);
        setNow(Date.now());
        onWaiting?.({
          instagram: next.waiting.filter((draft) => draft.channel === "instagram").length,
          messenger: next.waiting.filter((draft) => draft.channel === "messenger").length,
        });
      }
      if (!response.ok) throw new Error(body.error ?? "Something went wrong. Please try again.");
      return next;
    },
    [staffToken, onSignOut, onWaiting],
  );

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      if (cancelled) return;
      void call("/api/admin/social")
        .then(() => setLoadError(null))
        .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Could not load Instagram and Messenger."));
    };
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [call]);

  async function act(label: string, run: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await run();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const choose = (mode: Mode) =>
    act(`mode-${channel}`, () => call("/api/admin/social", { method: "POST", body: JSON.stringify({ channel, mode }) }));

  const decide = (draft: Draft, action: "send" | "discard") =>
    act(`${action}-${draft.id}`, () =>
      call(`/api/admin/social/drafts/${draft.id}`, {
        method: "POST",
        body: JSON.stringify({ action, text: texts[draft.id] ?? draft.reply, name: savedName() || null }),
      }),
    );

  if (!state) {
    if (!loadError) return null;
    return (
      <Panel title="Instagram and Messenger replies">
        <p className="text-sm text-brand-dark">{loadError}</p>
        <p className="mt-1 text-xs text-muted">If the database was just updated, run supabase/schema.sql again in Supabase.</p>
      </Panel>
    );
  }

  const info = state.channels[channel];
  const waiting = state.waiting.filter((draft) => draft.channel === channel);
  const decided = state.decided.filter((draft) => draft.channel === channel);
  const { label, icon, where } = CHANNEL[channel];

  const draftCard = (draft: Draft) => {
    const late = draft.lateAt ? Date.parse(draft.lateAt) < now : false;
    const text = texts[draft.id] ?? draft.reply;
    return (
      <article key={draft.id} className="@container overflow-hidden rounded-2xl border border-line">
        <header className="flex flex-wrap items-center justify-between gap-3 bg-surface/70 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-heading text-sm font-bold uppercase text-white"
              aria-hidden="true"
            >
              {initial(draft.customer_name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-heading">{draft.customer_name || "Customer"}</p>
              <p className="text-xs text-muted">{when(draft.created_at)}</p>
            </div>
          </div>
          {draft.lateAt && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                late ? "bg-red-100 text-brand-dark" : "bg-amber-100 text-amber-900"
              }`}
            >
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {late ? "Over 24 hours: Meta may refuse it" : `Reply before ${when(draft.lateAt)}`}
            </span>
          )}
        </header>

        {/* Side by side once the card itself is wide enough, whatever the screen. */}
        <div className={`grid gap-4 p-4 sm:p-5 ${draft.question ? "@2xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" : ""}`}>
          {draft.question && (
            <div className="min-w-0">
              <p className={LABEL}>The customer wrote</p>
              <p className="mt-1.5 whitespace-pre-wrap break-words rounded-2xl rounded-tl-md bg-surface px-4 py-3 text-[15px] leading-relaxed text-heading">
                <LinkedText text={draft.question} previews={false} />
              </p>
            </div>
          )}
          <div className="min-w-0">
            <label className={`${LABEL} block`} htmlFor={`draft-${draft.id}`}>
              Clara&apos;s draft · you can change it
            </label>
            {/* As tall as its text (field-sizing), between about 4 and 16 lines; `rows` for older browsers. */}
            <textarea
              id={`draft-${draft.id}`}
              value={text}
              onChange={(event) => setTexts((current) => ({ ...current, [draft.id]: event.target.value }))}
              rows={Math.min(14, Math.max(4, text.split("\n").length + Math.ceil(text.length / 70)))}
              className="field-sizing-content mt-1.5 max-h-[26rem] min-h-32 w-full rounded-2xl border border-line bg-white px-4 py-3 text-[15px] leading-relaxed outline-none transition focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
            />
          </div>
        </div>

        {draft.status === "failed" && draft.error && (
          <p className="mx-4 mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-brand-dark sm:mx-5">{draft.error}</p>
        )}
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3 sm:px-5">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void decide(draft, "discard")}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-5 py-2.5 text-sm font-semibold text-heading transition hover:border-heading disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {busy === `discard-${draft.id}` ? "Discarding…" : "Discard"}
          </button>
          <button
            type="button"
            disabled={busy !== null || !text.trim()}
            onClick={() => void decide(draft, "send")}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {busy === `send-${draft.id}` ? "Sending…" : `Send on ${label}`}
          </button>
        </footer>
      </article>
    );
  };

  return (
    <div key={channel} className="animate-fade-up">
      <ChannelLayout
        settings={
          <ChannelPanel icon={icon} title={label} subtitle={where} badge={info.configured ? <ModeBadge mode={info.mode} /> : undefined}>
            {!info.configured ? (
              <p className="text-sm text-muted">Not set up on this server yet.</p>
            ) : (
              <div className="space-y-2">
                <p className={LABEL}>How Clara answers</p>
                <ModeSwitch
                  mode={info.mode}
                  label={`${label} replies`}
                  disabled={busy !== null}
                  onChange={(mode) => void choose(mode)}
                  notes={{ draft: "Clara's answer waits here for staff to check, change and send." }}
                />
              </div>
            )}
            <p className="flex gap-2.5 rounded-xl bg-surface px-3.5 py-3 text-xs leading-relaxed text-muted">
              <Clock className="mt-px h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
              Meta only takes a reply within 24 hours of the customer&apos;s last message.
            </p>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-brand-dark">{error}</p>}
          </ChannelPanel>
        }
      >
        <ListPanel
          title="Drafts waiting"
          subtitle="Read the customer's message, change Clara's draft if needed, then send it."
          aside={
            <span className={`rounded-full px-3 py-1 text-sm font-bold ${waiting.length ? "bg-brand text-white" : "bg-surface text-muted"}`}>
              {waiting.length}
            </span>
          }
        >
          <div className="space-y-4 p-4 sm:p-5">
            {waiting.length === 0 ? (
              <Empty
                icon={CircleCheck}
                title="Nothing waiting"
                text={
                  info.mode === "auto"
                    ? `Clara answers ${label} messages by herself. Choose “Draft for staff” to check her answers first.`
                    : `New ${label} messages show here with Clara's draft answer.`
                }
              />
            ) : (
              waiting.map(draftCard)
            )}
          </div>
        </ListPanel>

        {decided.length > 0 && (
          <ListPanel title="Recently decided" subtitle="The last drafts staff sent or discarded.">
            <ul className="divide-y divide-line">
              {decided.map((draft) => {
                const sent = draft.status === "sent";
                return (
                  <li key={draft.id} className="flex items-center gap-3 px-5 py-3">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${sent ? "bg-green-100 text-green-700" : "bg-surface text-muted"}`}
                      aria-hidden="true"
                    >
                      {sent ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-0.5">
                      <p className="truncate text-sm font-semibold text-heading">{draft.customer_name || "Customer"}</p>
                      <p className="text-xs text-muted">
                        {sent ? `Sent${draft.sent_text?.trim() === draft.reply.trim() ? " as written" : " after a change"}` : "Discarded"}
                        {draft.decided_by ? ` by ${draft.decided_by}` : ""}
                        {draft.decided_at ? ` · ${when(draft.decided_at)}` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </ListPanel>
        )}
      </ChannelLayout>
    </div>
  );
}
