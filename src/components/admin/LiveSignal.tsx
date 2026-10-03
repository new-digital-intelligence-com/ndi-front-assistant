"use client";

import { AudioLines } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// The live sound of a phone call (src/lib/liveSignal.ts): two moving bars, the customer and NDI's side
// (Clara, or the colleague after a hand-over), ten times a second, from the app's WebSocket (server.mjs).
// It shows loudness only: nobody hears the call from here.

type Frame = { c: number; n: number };
type State = "connecting" | "waiting" | "live" | "ended" | "unavailable";

const BARS = 64;
const MAX_RETRIES = 5;

function clockOf(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function LiveSignal({
  staffToken,
  kind,
  id,
  customerLabel = "Customer",
  ndiLabel = "Clara",
  problem = null,
}: {
  staffToken: string;
  kind: "list" | "incoming";
  id: string;
  customerLabel?: string;
  ndiLabel?: string;
  /** Why the live sound could not start, when the server knows (Twilio's refusal, no Twilio keys). */
  problem?: string | null;
}) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [state, setState] = useState<State>("connecting");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const endedRef = useRef(false);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let attempts = 0;
    const connect = () => {
      const url = `${window.location.origin.replace(/^http/, "ws")}/api/live/signal?key=${kind}:${id}&token=${encodeURIComponent(staffToken)}`;
      socket = new WebSocket(url);
      socket.onopen = () => {
        attempts = 0;
      };
      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as {
          type: "hello" | "state" | "level";
          state?: Exclude<State, "connecting" | "unavailable">;
          startedAt?: number | null;
          endedAt?: number | null;
          history?: Frame[];
          c?: number;
          n?: number;
        };
        if (message.state) {
          endedRef.current = message.state === "ended";
          setState(message.state);
        }
        if (message.startedAt) setStartedAt(message.startedAt);
        setEndedAt(message.endedAt ?? null);
        if (message.type === "hello") setFrames((message.history ?? []).slice(-BARS));
        if (message.type === "level") setFrames((current) => [...current.slice(-(BARS - 1)), { c: message.c ?? 0, n: message.n ?? 0 }]);
      };
      socket.onclose = () => {
        if (stopped || endedRef.current) return;
        attempts += 1;
        // `npm run dev` has no live sound (server.mjs runs with `npm start` only).
        if (attempts > MAX_RETRIES) return setState("unavailable");
        retry = setTimeout(connect, 1500 * attempts);
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, [kind, id, staffToken]);

  useEffect(() => {
    if (state !== "live") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state]);

  const padded = [...Array<Frame>(Math.max(0, BARS - frames.length)).fill({ c: 0, n: 0 }), ...frames];
  const caption: Record<State, string> = {
    connecting: "Connecting to the live sound…",
    waiting: problem ? `No live sound: ${problem}` : "Waiting for the call's sound…",
    live: "Live",
    ended: "Call ended",
    unavailable: "The live sound is not available right now.",
  };

  return (
    <div className="rounded-2xl bg-night p-4 text-white" aria-label={`Live sound: ${caption[state]}`}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-2 font-semibold">
          {state === "live" ? (
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden="true" />
          ) : (
            <AudioLines className="h-3.5 w-3.5 shrink-0 text-white/50" aria-hidden="true" />
          )}
          <span className={`truncate ${state === "live" ? "" : "text-white/60"}`}>{caption[state]}</span>
        </span>
        {startedAt && (state === "live" || endedAt) && (
          <span className="shrink-0 tabular-nums text-white/60">{clockOf((state === "live" ? now : (endedAt ?? now)) - startedAt)}</span>
        )}
      </div>
      <div className="mt-3 space-y-2">
        <Bars label={customerLabel} values={padded.map((frame) => frame.c)} tone="bg-accent" dim={state !== "live"} />
        <Bars label={ndiLabel} values={padded.map((frame) => frame.n)} tone="bg-white" dim={state !== "live"} />
      </div>
    </div>
  );
}

/** One side's levels, newest on the right. On a narrow screen the oldest are cut off on the left. */
function Bars({ label, values, tone, dim }: { label: string; values: number[]; tone: string; dim: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 truncate text-[11px] font-semibold text-white/70 sm:w-20">{label}</span>
      <div className={`flex h-9 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden ${dim ? "opacity-40" : ""}`} aria-hidden="true">
        {values.map((value, index) => (
          <span
            key={index}
            className={`w-[3px] shrink-0 rounded-full sm:w-auto sm:min-w-[2px] sm:flex-1 sm:shrink ${tone} transition-[height] duration-100`}
            style={{ height: `${Math.max(6, Math.round(value * 100))}%` }}
          />
        ))}
      </div>
    </div>
  );
}
