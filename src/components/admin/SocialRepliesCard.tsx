"use client";

import { useCallback, useEffect, useState } from "react";
import { savedName } from "../aida/types";

// Instagram and Messenger on /admin (src/lib/socialDrafts.ts): per channel, Clara's answers go out straight
// away or wait here as drafts. Staff read the customer's message, change the draft if needed and send it,
// or discard it. Meta only takes a reply within 24 hours of the customer's last message.

type Mode = "auto" | "draft";
type Channel = "instagram" | "messenger";

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
const CHANNEL_LABEL: Record<Channel, string> = { instagram: "📷 Instagram", messenger: "💬 Messenger" };

const when = (iso: string) =>
  new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function SocialRepliesCard({ staffToken, onSignOut }: { staffToken: string; onSignOut: () => void }) {
  const [state, setState] = useState<State | null>(null);
  const [texts, setTexts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Why the card could not load, shown instead of the card (e.g. supabase/schema.sql not run again yet). */
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
      }
      if (!response.ok) throw new Error(body.error ?? "Something went wrong. Please try again.");
      return next;
    },
    [staffToken, onSignOut],
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

  const choose = (channel: Channel, mode: Mode) =>
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
      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-heading">Instagram and Messenger replies</h2>
        <p className="mt-1 text-sm text-brand-dark">{loadError}</p>
        <p className="mt-1 text-xs text-muted">If the database was just updated, run supabase/schema.sql again in Supabase.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-xl bg-white p-5 shadow-sm">
      <div>
        <h2 className="font-semibold text-heading">Instagram and Messenger replies</h2>
        <p className="mt-1 text-xs text-muted">
          Clara answers direct messages to @new_digital_intelligence and the New Digital Intelligence Page, while Meta sends them to
          this app (CHANNEL_SETUP.md: the switch with the CDA demo).
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(["instagram", "messenger"] as const).map((channel) => {
          const info = state.channels[channel];
          return (
            <div key={channel} className="space-y-2 rounded-lg border border-line p-3">
              <p className="text-sm font-semibold text-heading">{CHANNEL_LABEL[channel]}</p>
              {!info.configured ? (
                <p className="text-xs text-muted">Not set up on this server yet.</p>
              ) : (
                <>
                  <div role="radiogroup" aria-label={`${channel} replies`} className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ["auto", "Send automatically"],
                        ["draft", "Draft for staff"],
                      ] as const
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={info.mode === mode}
                        disabled={busy !== null}
                        onClick={() => void choose(channel, mode)}
                        className={`rounded-lg border px-2 py-2 text-xs font-semibold disabled:opacity-60 ${
                          info.mode === mode ? "border-brand bg-brand text-white" : "border-line bg-white text-heading"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted">
                    {info.mode === "auto" ? "Clara's answer is sent straight away." : "Clara's answer waits below until staff send it."}
                  </p>
                </>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-brand-dark">{error}</p>}

      <div className="space-y-3 border-t border-line pt-3">
        <p className="text-sm font-semibold text-heading">Drafts waiting ({state.waiting.length})</p>
        {state.waiting.length === 0 && <p className="text-xs text-muted">Nothing waiting.</p>}
        {state.waiting.map((draft) => {
          const late = draft.lateAt ? Date.parse(draft.lateAt) < now : false;
          const text = texts[draft.id] ?? draft.reply;
          return (
            <article key={draft.id} className="space-y-2 rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-heading">
                  {CHANNEL_LABEL[draft.channel]} · {draft.customer_name || "Customer"}
                </span>
                <span className={late ? "font-semibold text-brand-dark" : "text-muted"}>
                  {when(draft.created_at)}
                  {draft.lateAt && (late ? " · over 24 hours: Meta may refuse it" : ` · reply before ${when(draft.lateAt)}`)}
                </span>
              </div>
              {draft.question && (
                <p className="rounded-md bg-surface px-3 py-2 text-sm text-heading">
                  <span className="block text-[11px] font-semibold text-muted">Customer wrote</span>
                  {draft.question}
                </p>
              )}
              <label className="block text-[11px] font-semibold text-muted" htmlFor={`draft-${draft.id}`}>
                Clara&apos;s draft (you can change it)
              </label>
              <textarea
                id={`draft-${draft.id}`}
                value={text}
                onChange={(event) => setTexts((current) => ({ ...current, [draft.id]: event.target.value }))}
                rows={Math.min(10, Math.max(3, Math.ceil(text.length / 80)))}
                className="w-full rounded-lg border border-line px-3 py-2 text-sm"
              />
              {draft.status === "failed" && draft.error && <p className="text-xs font-semibold text-brand-dark">{draft.error}</p>}
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void decide(draft, "discard")}
                  className="rounded-full border border-line px-4 py-1.5 text-xs font-semibold text-heading disabled:opacity-50"
                >
                  {busy === `discard-${draft.id}` ? "Discarding…" : "Discard"}
                </button>
                <button
                  type="button"
                  disabled={busy !== null || !text.trim()}
                  onClick={() => void decide(draft, "send")}
                  className="rounded-full bg-brand px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {busy === `send-${draft.id}` ? "Sending…" : "Send"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {state.decided.length > 0 && (
        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-sm font-semibold text-heading">Recently decided</p>
          <ul className="space-y-1">
            {state.decided.map((draft) => (
              <li key={draft.id} className="text-xs text-muted">
                {CHANNEL_LABEL[draft.channel]} · {draft.customer_name || "Customer"} ·{" "}
                {draft.status === "sent"
                  ? `sent${draft.sent_text?.trim() === draft.reply.trim() ? " as written" : " after a change"}`
                  : "discarded"}
                {draft.decided_by ? ` by ${draft.decided_by}` : ""}
                {draft.decided_at ? ` · ${when(draft.decided_at)}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
