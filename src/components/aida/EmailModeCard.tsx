"use client";

import { ExternalLink, Inbox, Mail, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ChannelLayout, ChannelPanel, Empty, ListPanel, ModeBadge, ModeSwitch } from "../admin/ui";

type EmailMode = "auto" | "draft";

type RecentEmail = {
  id: string;
  threadId: string;
  from: string | null;
  subject: string | null;
  status: "new" | "waiting" | "replying" | "sent" | "draft" | "skipped" | "failed";
  reason: string | null;
  at: string;
  /** Claude rated the email upset: Clara's answer was left as a draft for staff. */
  upset?: boolean;
};

type EmailState = { configured: boolean; mode?: EmailMode; mailbox?: string | null; recent?: RecentEmail[] };

const REFRESH_MS = 15_000;

const STATUS: Record<RecentEmail["status"], { label: string; className: string }> = {
  new: { label: "Clara is writing…", className: "bg-blue-50 text-blue-800" },
  waiting: { label: "Clara is writing…", className: "bg-blue-50 text-blue-800" },
  replying: { label: "Clara is writing…", className: "bg-blue-50 text-blue-800" },
  sent: { label: "Replied", className: "bg-green-100 text-green-800" },
  draft: { label: "Left as a draft", className: "bg-amber-100 text-amber-900" },
  skipped: { label: "Skipped", className: "bg-line text-heading" },
  failed: { label: "Failed", className: "bg-red-100 text-brand" },
};

const when = (iso: string) => new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * The Email tab of /admin/replies. Staff choose whether Clara's email replies go out straight away or wait
 * as Gmail drafts in the customer's thread. The setting is stored in ElevenLabs (`email_mode` on the Aida
 * agent), so a change made here and one made by Claude through the ElevenLabs connector are the same switch.
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
      <ChannelPanel icon={Mail} title="Email" subtitle="Not set up on this server yet.">
        <p className="text-sm text-muted">The email channel is not set up on this server yet.</p>
      </ChannelPanel>
    );
  }

  const gmailLink = (threadId: string) =>
    `https://mail.google.com/mail/?authuser=${encodeURIComponent(state.mailbox ?? "")}#all/${threadId}`;
  const recent = state.recent ?? [];

  return (
    <ChannelLayout
      settings={
        <ChannelPanel icon={Mail} title="Email" subtitle={`Emails to ${state.mailbox}`} badge={<ModeBadge mode={state.mode} />}>
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">How Clara answers</p>
            <ModeSwitch
              mode={state.mode}
              label="Email replies"
              disabled={saving}
              onChange={(mode) => void choose(mode)}
              notes={{
                auto: "Clara's reply goes to the customer straight away.",
                draft: "Clara's reply waits as a draft in the customer's Gmail thread, for staff to check and send.",
              }}
            />
          </div>
          <p className="flex gap-2.5 rounded-xl bg-surface px-3.5 py-3 text-xs leading-relaxed text-muted">
            <ShieldAlert className="mt-px h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
            An upset customer&apos;s email always waits as a draft, even when Clara sends automatically, and staff get an
            email about it.
          </p>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-brand-dark">{error}</p>}
        </ChannelPanel>
      }
    >
      <ListPanel title="Latest emails" subtitle="The last emails to NDI, newest first, and what Clara did with each.">
        {recent.length === 0 ? (
          <div className="p-5">
            <Empty icon={Inbox} title="No emails yet" text="Emails to NDI show here as soon as they arrive." />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((email) => {
              const from = email.from ?? "Unknown sender";
              return (
                <li key={email.id} className={`flex items-start gap-3.5 px-5 py-4 ${email.upset ? "bg-red-50/60" : ""}`}>
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold uppercase ${
                      email.upset ? "bg-red-100 text-brand-dark" : "bg-heading text-white"
                    }`}
                    aria-hidden="true"
                  >
                    {from.match(/[\p{L}\p{N}]/u)?.[0] ?? "?"}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-heading">{from}</p>
                      <p className="truncate text-sm text-ink">{email.subject || "(no subject)"}</p>
                      {email.reason && <p className="mt-0.5 text-xs text-muted">{email.reason}</p>}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {email.upset && (
                        <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-brand-dark">😠 Upset</span>
                      )}
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS[email.status].className}`}>
                        {STATUS[email.status].label}
                      </span>
                      <span className="text-xs tabular-nums text-muted lg:w-28 lg:text-right">{when(email.at)}</span>
                      <a
                        href={gmailLink(email.threadId)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-1.5 text-xs font-semibold text-heading transition hover:border-heading"
                      >
                        Open in Gmail <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </ListPanel>
    </ChannelLayout>
  );
}
