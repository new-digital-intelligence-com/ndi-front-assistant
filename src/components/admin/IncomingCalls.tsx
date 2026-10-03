"use client";

import { Clock, PhoneForwarded, PhoneIncoming } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { HandoverLive } from "./HandoverLive";
import { LiveSignal } from "./LiveSignal";
import { Empty, Panel } from "./ui";

// Calls to NDI (/admin/calls/incoming, src/lib/incomingCalls.ts): the ones happening now, each with its
// live sound, and the last twenty with ElevenLabs' summary and how a hand-over went. A hand-over to a
// colleague opens its live view (conversation and Aida's suggestions) by itself.

type HandoverStatus = "ringing" | "live" | "ended" | "missed" | "abandoned" | "failed";

type IncomingCall = {
  id: string;
  phone: string | null;
  name: string | null;
  status: "live" | "ended";
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  live_signal: string | null;
  handover_name: string | null;
  handover_status: HandoverStatus | null;
  handover_note: string | null;
};

/** How often the list is asked for: often while staff look at it, less when they are on another tab. */
const WATCHING_MS = 3_000;
const AWAY_MS = 10_000;

const handingOver = (call: IncomingCall) => call.handover_status === "ringing" || call.handover_status === "live";

const when = (iso: string) => new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function duration(from: string, to: string | null): string {
  const seconds = Math.max(0, Math.round((Date.parse(to ?? "") - Date.parse(from)) / 1000));
  if (!Number.isFinite(seconds) || !to) return "";
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

const OUTCOME: Record<HandoverStatus, (colleague: string) => { text: string; style: string }> = {
  ringing: (colleague) => ({ text: `Ringing ${colleague}…`, style: "bg-amber-100 text-amber-900" }),
  live: (colleague) => ({ text: `With ${colleague}`, style: "bg-red-50 text-brand-dark" }),
  ended: (colleague) => ({ text: `Talked with ${colleague}`, style: "bg-green-100 text-green-800" }),
  missed: () => ({ text: "Nobody took it", style: "bg-line text-heading" }),
  abandoned: () => ({ text: "Hung up while waiting", style: "bg-line text-heading" }),
  failed: () => ({ text: "Hand-over failed", style: "bg-red-50 text-brand-dark" }),
};

function outcomeOf(call: IncomingCall) {
  return call.handover_status
    ? OUTCOME[call.handover_status](call.handover_name || "a colleague")
    : { text: call.status === "live" ? "With Clara" : "Clara only", style: "bg-surface text-heading" };
}

export function IncomingCalls({
  staffToken,
  onSignOut,
  active,
  onLiveCount,
}: {
  staffToken: string;
  onSignOut: () => void;
  /** Whether staff are looking at this tab. */
  active: boolean;
  /** How many calls are on now, for the tab's badge. */
  onLiveCount: (count: number) => void;
}) {
  const [data, setData] = useState<{ live: IncomingCall[]; recent: IncomingCall[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The call whose hand-over is shown, and the ones staff closed (they do not open again by themselves). */
  const [openId, setOpenId] = useState<string | null>(null);
  const closedRef = useRef(new Set<string>());

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/calls/incoming", { headers: { "x-aida-staff": staffToken }, cache: "no-store" });
      if (response.status === 401) return onSignOut();
      const body = (await response.json().catch(() => ({}))) as { live?: IncomingCall[]; recent?: IncomingCall[]; error?: string };
      if (!response.ok || !body.live || !body.recent) throw new Error(body.error ?? "Could not load the calls to NDI.");
      setData({ live: body.live, recent: body.recent });
      setError(null);
      onLiveCount(body.live.length);
      const handedOver = body.live.find((call) => handingOver(call) && !closedRef.current.has(call.id));
      if (handedOver) setOpenId((current) => current ?? handedOver.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the calls to NDI.");
    }
  }, [staffToken, onSignOut, onLiveCount]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), active ? WATCHING_MS : AWAY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load, active]);

  return (
    <div className="space-y-4">
      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-brand-dark">{error}</p>}

      {openId && (
        <HandoverLive
          key={openId}
          staffToken={staffToken}
          kind="incoming"
          itemId={openId}
          onSignOut={onSignOut}
          onClose={() => {
            closedRef.current.add(openId);
            setOpenId(null);
          }}
        />
      )}

      <Panel title={`Live now (${data?.live.length ?? 0})`} icon={PhoneIncoming}>
        {!data ? (
          <p className="text-sm text-muted">{error ? "—" : "Loading…"}</p>
        ) : data.live.length === 0 ? (
          <Empty
            icon={PhoneIncoming}
            title="No calls right now"
            text="When someone calls NDI's number, the call appears here as Clara answers, with its live sound."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {data.live.map((call) => {
              const outcome = outcomeOf(call);
              return (
                <article key={call.id} className="min-w-0 space-y-3 rounded-2xl border border-line p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-heading">{call.name || call.phone || "Unknown caller"}</p>
                      <p className="text-xs text-muted">
                        {call.name && call.phone ? `${call.phone} · ` : ""}since {when(call.started_at)}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${outcome.style}`}>{outcome.text}</span>
                  </div>
                  <LiveSignal
                    staffToken={staffToken}
                    kind="incoming"
                    id={call.id}
                    customerLabel={call.name || "Caller"}
                    ndiLabel={call.handover_status === "live" ? call.handover_name || "Colleague" : "Clara"}
                    problem={call.live_signal}
                  />
                  {handingOver(call) && openId !== call.id && (
                    <button
                      type="button"
                      onClick={() => setOpenId(call.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
                    >
                      <PhoneForwarded className="h-3.5 w-3.5" aria-hidden="true" /> Open the hand-over
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Recent calls" icon={Clock}>
        {data && data.recent.length === 0 ? (
          <p className="text-sm text-muted">No calls yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data?.recent.map((call) => {
              const outcome = outcomeOf(call);
              return (
                <li key={call.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold text-heading">{call.name || call.phone || "Unknown caller"}</span>
                    {call.name && call.phone && <span className="text-xs text-muted">{call.phone}</span>}
                    <span className="text-xs text-muted">
                      {when(call.started_at)}
                      {call.ended_at ? ` · ${duration(call.started_at, call.ended_at)}` : ""}
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${outcome.style}`}>{outcome.text}</span>
                    {call.handover_status === "ended" && (
                      <button type="button" onClick={() => setOpenId(call.id)} className="text-xs font-semibold text-brand hover:underline">
                        View conversation
                      </button>
                    )}
                  </div>
                  {call.summary && <p className="mt-1 text-sm text-ink">{call.summary}</p>}
                  {call.handover_note && <p className="mt-1 rounded-lg bg-surface px-3 py-2 text-xs text-heading">{call.handover_note}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
