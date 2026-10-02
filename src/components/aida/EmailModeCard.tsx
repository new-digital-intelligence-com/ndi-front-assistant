"use client";

import { useCallback, useEffect, useState } from "react";

type EmailMode = "auto" | "draft";

type RecentEmail = {
  id: string;
  threadId: string;
  from: string | null;
  subject: string | null;
  status: "new" | "waiting" | "replying" | "sent" | "draft" | "skipped" | "failed";
  reason: string | null;
  at: string;
  /** Claude rated the email upset: Ellie's answer was left as a draft for staff. */
  upset?: boolean;
};

type EmailState = { configured: boolean; mode?: EmailMode; mailbox?: string | null; recent?: RecentEmail[] };

const REFRESH_MS = 15_000;

const STATUS: Record<RecentEmail["status"], { label: string; className: string }> = {
  new: { label: "Ellie is writing…", className: "bg-blue-50 text-blue-800" },
  waiting: { label: "Ellie is writing…", className: "bg-blue-50 text-blue-800" },
  replying: { label: "Ellie is writing…", className: "bg-blue-50 text-blue-800" },
  sent: { label: "Replied", className: "bg-green-100 text-green-800" },
  draft: { label: "Draft ready", className: "bg-amber-100 text-amber-900" },
  skipped: { label: "Skipped", className: "bg-cda-grey text-cda-dark" },
  failed: { label: "Failed", className: "bg-red-100 text-cda-red" },
};

/**
 * Staff choose whether Ellie's email replies go out straight away or wait as Gmail drafts in the
 * customer's thread. The setting is stored in ElevenLabs (`email_mode` on the Aida agent), so a
 * change made here and one made by Claude through the ElevenLabs connector are the same switch.
 */
export function EmailModeCard({ staffToken }: { staffToken: string }) {
  const [state, setState] = useState<EmailState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<EmailState | null> => {
    const response = await fetch("/api/email/mode", { headers: { "x-aida-staff": staffToken } });
    return response.ok ? ((await response.json()) as EmailState) : null;
  }, [staffToken]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      load()
        .then((next) => {
          if (!cancelled && next) setState(next);
        })
        .catch(() => {});
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [load]);

  async function choose(mode: EmailMode) {
    if (mode === state?.mode) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/email/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-aida-staff": staffToken },
        body: JSON.stringify({ mode }),
      });
      const body = (await response.json().catch(() => ({}))) as { mode?: EmailMode; error?: string };
      if (!response.ok || !body.mode) throw new Error(body.error ?? "Could not change the setting.");
      setState((current) => (current ? { ...current, mode: body.mode } : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the setting.");
    } finally {
      setSaving(false);
    }
  }

  if (!state) return null;
  if (!state.configured) {
    return (
      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-cda-dark">Email replies</h2>
        <p className="mt-1 text-sm text-cda-text">The email channel is not set up on this server yet.</p>
      </section>
    );
  }

  const gmailLink = (threadId: string) =>
    `https://mail.google.com/mail/?authuser=${encodeURIComponent(state.mailbox ?? "")}#all/${threadId}`;

  return (
    <section className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
      <div>
        <h2 className="font-semibold text-cda-dark">Email replies</h2>
        <p className="mt-1 text-xs text-cda-text">Ellie answers emails sent to {state.mailbox}.</p>
      </div>

      <div role="radiogroup" aria-label="Email replies" className="grid grid-cols-2 gap-2">
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
            aria-checked={state.mode === mode}
            disabled={saving}
            onClick={() => void choose(mode)}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-60 ${
              state.mode === mode ? "border-cda-red bg-cda-red text-white" : "border-cda-grey bg-white text-cda-dark"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-cda-text">
        {state.mode === "auto"
          ? "Ellie's reply is sent to the customer straight away."
          : "Ellie's reply waits as a draft in the customer's Gmail thread. Open it, check it and press Send."}
      </p>
      {error && <p className="text-sm text-cda-red">{error}</p>}

      <div className="border-t border-cda-grey pt-3">
        <p className="text-sm font-semibold text-cda-dark">Latest emails</p>
        {!state.recent?.length ? (
          <p className="mt-1 text-xs text-cda-text">No emails since the switch to Gmail.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {state.recent.map((email) => (
              <li key={email.id} className="rounded-lg bg-cda-grey-light px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-semibold text-cda-dark">{email.from ?? "Unknown sender"}</span>
                  <span className="flex shrink-0 gap-1">
                    {email.upset && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-cda-red-dark">😠 Upset</span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[email.status].className}`}>
                      {STATUS[email.status].label}
                    </span>
                  </span>
                </div>
                <p className="truncate text-xs text-cda-text">{email.subject || "(no subject)"}</p>
                <p className="text-[11px] text-cda-text">
                  {new Date(email.at).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {email.reason ? ` · ${email.reason}` : ""} ·{" "}
                  <a href={gmailLink(email.threadId)} target="_blank" rel="noreferrer" className="underline">
                    Open in Gmail
                  </a>
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
