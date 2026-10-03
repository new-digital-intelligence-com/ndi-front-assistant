"use client";

import { AudioLines } from "lucide-react";
import { useEffect, useState } from "react";

// The live sound of a phone call, in its live view (src/components/admin/LiveCall.tsx): two moving bars, the
// customer and NDI's side (Clara, or the colleague after a hand-over), ten times a second, from the app's
// WebSocket (server.mjs). It shows loudness only: nobody hears the call from here.
//
// Being connected is what keeps the call's live sound and transcript running (src/lib/liveCall.ts): they
// start when the first page connects and stop shortly after the last one has gone.

type Frame = { c: number; n: number };
type State = "connecting" | "waiting" | "live" | "unavailable";

const BARS = 64;
const MAX_RETRIES = 5;

export function LiveSignal({
  staffToken,
  kind,
  id,
  customerLabel = "Customer",
  ndiLabel = "Clara",
}: {
  staffToken: string;
  kind: "list" | "incoming";
  id: string;
  customerLabel?: string;
  ndiLabel?: string;
}) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [state, setState] = useState<State>("connecting");

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
          state?: "waiting" | "live";
          history?: Frame[];
          c?: number;
          n?: number;
        };
        if (message.state) setState(message.state);
        if (message.type === "hello") setFrames((message.history ?? []).slice(-BARS));
        if (message.type === "level") setFrames((current) => [...current.slice(-(BARS - 1)), { c: message.c ?? 0, n: message.n ?? 0 }]);
      };
      socket.onclose = () => {
        if (stopped) return;
        attempts += 1;
        // `npm run dev` has no live sound (server.mjs runs with `npm start` only).
        if (attempts > MAX_RETRIES) return setState("unavailable");
        setState("connecting");
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

  const padded = [...Array<Frame>(Math.max(0, BARS - frames.length)).fill({ c: 0, n: 0 }), ...frames];
  const caption: Record<State, string> = {
    connecting: "Connecting to the live sound…",
    waiting: "Waiting for the call's sound…",
    live: "Live",
    unavailable: "The live sound is not available right now.",
  };

  return (
    <div className="rounded-2xl bg-night p-4 text-white" aria-label={`Live sound: ${caption[state]}`}>
      <div className="flex items-center gap-2 text-xs font-semibold">
        {state === "live" ? (
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden="true" />
        ) : (
          <AudioLines className="h-3.5 w-3.5 shrink-0 text-white/50" aria-hidden="true" />
        )}
        <span className={`truncate ${state === "live" ? "" : "text-white/60"}`}>{caption[state]}</span>
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
