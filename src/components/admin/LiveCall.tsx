"use client";

import { LinkedText } from "../LinkedText";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { X } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { LiveSignal } from "./LiveSignal";

// A phone call's live view on /admin/calls, opened by staff (src/lib/liveCall.ts): its sound, what is said
// as Twilio transcribes it (the customer and Clara, then the colleague after a hand-over), and during a
// hand-over Aida's suggestions for what the colleague could say next. A call from a staff call list (kind
// "list") or a call to NDI ("incoming"). An ended call shows what was said and how it ended. Once Clara's part
// is over (the call ended, or she handed it over), it shows in full as ElevenLabs keeps it, free, in place of
// any live lines of it (the user's request, 4 Oct 2026).
//
// Twilio charges for the sound and the transcript by the minute, so they run only while this view is open
// on a running call: its sound bars (LiveSignal) keep them going, and closing the view stops them. The one
// exception: the colleague's talk after a hand-over is written down in any case, for the customer's memory.
//
// Aida runs in this browser only while the colleague and the customer talk, the same way she does for the
// host of an Aida room. Before the first line she is told what Clara learnt, the staff instructions (call
// lists), what NDI already knows about the customer and the call so far. Customer lines are her
// questions; everything else is background she never answers.

type HandoverStatus = "ringing" | "live" | "ended" | "missed" | "abandoned" | "failed";

type Call = {
  id: string;
  phone: string | null;
  name: string | null;
  instructions: string;
  on: boolean;
  started_at: string | null;
  ended_at: string | null;
  summary: string | null;
  live_signal: string | null;
  handover_name: string | null;
  handover_status: HandoverStatus | null;
  handover_summary: string | null;
  handover_started_at: string | null;
  handover_live_at: string | null;
  handover_ended_at: string | null;
  handover_note: string | null;
};

type Line = { id: number; speaker: "customer" | "clara" | "colleague"; text: string; created_at: string };
type Speaker = Line["speaker"];
/** Clara's part in full, from ElevenLabs: "pending" until ElevenLabs has finished with it. */
type Clara = { state: "pending" | "done" | "none"; lines: { speaker: "customer" | "clara"; text: string }[] };
type Known = { name: string | null; recent: string[]; interests: string[] } | null;
type Suggestion = { id: string; text: string; replyTo: string };

const POLL_MS = 1_500;
/** ElevenLabs finishes a conversation within seconds to a minute: asked every 5 s, for up to 3 minutes. */
const CLARA_RETRY_MS = 5_000;
const CLARA_TRIES = 36;
/** After a hand-over, how long to keep asking for the note that sums up the talk. */
const NOTE_WAIT_MS = 60_000;
/** How much of the call a newly started Aida is given, so she is not starting from nothing. */
const CONTEXT_LINES = 15;
const MAX_SUGGESTIONS = 6;
/**
 * How long Aida may take to connect before the view gives up on that try, and how soon it tries again while
 * the two still talk. On the first real hand-over (6 Oct 2026) her start never finished and the box said
 * "starting…" until the call ended.
 */
const AIDA_START_TIMEOUT_MS = 12_000;
const AIDA_RETRY_MS = 4_000;

/** The promise, or a rejection naming what took too long. */
function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} took longer than ${ms / 1000} s`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
/** Aida writes this when a customer line needs no answer ("ok", "thanks"). */
const NO_REPLY = /\[no reply needed\]/i;
/** Notes for staff at the start of a suggestion, e.g. "[Check]". */
const STAFF_NOTE = /^\s*\[([^\]]+)\]\s*/;

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Whether a line was said after the given moment (the hand-over's start, or the colleague joining). */
const saidAfter = (line: Line, iso: string | null) => Boolean(iso) && Date.parse(line.created_at) >= Date.parse(iso ?? "");

function minutesAndSeconds(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

type Props = { staffToken: string; kind: "list" | "incoming"; callId: string; onClose: () => void; onSignOut: () => void };

export function LiveCall(props: Props) {
  return (
    <ConversationProvider>
      <LiveView {...props} />
    </ConversationProvider>
  );
}

function LiveView({ staffToken, kind, callId, onClose, onSignOut }: Props) {
  const [call, setCall] = useState<Call | null>(null);
  const [known, setKnown] = useState<Known>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [clara, setClara] = useState<Clara | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [aida, setAida] = useState<"off" | "starting" | "on" | "retrying" | "unavailable">("off");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const callRef = useRef<Call | null>(null);
  const knownRef = useRef<Known>(null);
  const linesRef = useRef<Line[]>([]);
  const lastIdRef = useRef(0);
  /** The last line Aida has been given, so none is given twice. */
  const fedUpToRef = useRef(0);
  /** Customer lines Aida still owes a suggestion for; anything she says unasked is ignored. */
  const pendingDraftsRef = useRef(0);
  const lastCustomerRef = useRef("");
  const copilotReadyRef = useRef(false);
  const copilotStartingRef = useRef(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  const colleague = call?.handover_name || "the colleague";
  const customer = call?.name || "the customer";

  // --- Aida -----------------------------------------------------------------------------------------

  const copilot = useConversation({
    onConnect: () => {
      copilotReadyRef.current = true;
      setAida("on");
      handlersRef.current?.seed();
    },
    onDisconnect: () => {
      copilotReadyRef.current = false;
      handlersRef.current?.dropped();
    },
    onMessage: ({ message, role }) => {
      if (role === "agent") handlersRef.current?.onDraft(message);
    },
    onError: (message) => console.warn("Aida:", message),
  });
  const copilotRef = useRef(copilot);

  const handlersRef = useRef<{
    seed: () => void;
    feed: () => void;
    onDraft: (message: string) => void;
    dropped: () => void;
    start: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    copilotRef.current = copilot;
    const colleagueName = () => callRef.current?.handover_name || "the NDI colleague";
    const who = (line: Line) => (line.speaker === "customer" ? "Customer" : line.speaker === "clara" ? "Clara" : colleagueName());

    /** Customer lines are Aida's questions; Clara's and the colleague's lines are background. */
    const give = (line: Line) => {
      if (line.speaker === "customer") {
        pendingDraftsRef.current += 1;
        lastCustomerRef.current = line.text;
        copilotRef.current.sendUserMessage(`${callRef.current?.name || "Customer"}: ${line.text}`);
      } else {
        copilotRef.current.sendContextualUpdate(`${line.speaker === "clara" ? "Clara" : `NDI colleague ${colleagueName()}`} said: ${line.text}`);
      }
      fedUpToRef.current = Math.max(fedUpToRef.current, line.id);
    };

    handlersRef.current = {
      seed() {
        const current = callRef.current;
        if (!current) return;
        const about = knownRef.current;
        const name = current.handover_name || "an NDI colleague";
        copilotRef.current.sendContextualUpdate(
          [
            kind === "list"
              ? "This is a live phone call, not a chat. Clara, NDI's virtual assistant, phoned the customer from a staff call list"
              : "This is a live phone call, not a chat. The customer phoned NDI; Clara, NDI's virtual assistant, answered",
            `and handed the call over to ${name}, who is now talking with them. For each customer message, write what ${name}`,
            "could say next: one to three short sentences that are easy to say out loud.",
            current.instructions ? `Staff instructions for this call: ${current.instructions}` : "",
            current.handover_summary ? `What Clara told ${name}: ${current.handover_summary}` : "",
            about
              ? [
                  `What NDI knows about the customer${about.name ? ` (${about.name})` : ""}, from earlier conversations. Do not read it out:`,
                  ...about.recent.map((note) => `- ${note}`),
                  ...about.interests.map((interest) => `- Interested in: ${interest}`),
                ].join("\n")
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
        );
        // The call so far as background, except a last customer line of the talk still waiting for an answer.
        const recent = linesRef.current.slice(-CONTEXT_LINES);
        const last = recent.at(-1);
        const waiting = last?.speaker === "customer" && saidAfter(last, current.handover_live_at) ? last : undefined;
        const before = waiting ? recent.slice(0, -1) : recent;
        if (before.length) {
          copilotRef.current.sendContextualUpdate(`The call so far:\n${before.map((line) => `${who(line)}: ${line.text}`).join("\n")}`);
        }
        fedUpToRef.current = Math.max(fedUpToRef.current, before.at(-1)?.id ?? 0, linesRef.current.at(-1)?.id ?? 0);
        if (waiting) give(waiting);
      },
      feed() {
        if (!copilotReadyRef.current) return; // the seed gives her everything once she is ready
        for (const line of linesRef.current) if (line.id > fedUpToRef.current) give(line);
      },
      onDraft(message) {
        if (pendingDraftsRef.current <= 0) return;
        pendingDraftsRef.current -= 1;
        const text = message.trim();
        if (!text || NO_REPLY.test(text)) return;
        const suggestion = { id: crypto.randomUUID(), text, replyTo: lastCustomerRef.current };
        setSuggestions((current) => [suggestion, ...current].slice(0, MAX_SUGGESTIONS));
      },
      dropped() {
        // Aida's session has a time limit: she is started again for as long as the two are talking.
        if (callRef.current?.handover_status === "live") setTimeout(() => void handlersRef.current?.start(), 1500);
        else setAida("off");
      },
      async start() {
        if (copilotStartingRef.current || copilotReadyRef.current) return;
        copilotStartingRef.current = true;
        setAida("starting");
        try {
          const response = await withTimeout(
            fetch(`/api/admin/calls/live/${callId}/copilot?kind=${kind}`, {
              method: "POST",
              headers: { "x-aida-staff": staffToken },
            }),
            AIDA_START_TIMEOUT_MS,
            "Aida's link",
          );
          if (response.status === 401) return onSignOut();
          const body = (await response.json().catch(() => ({}))) as { signedUrl?: string; error?: string };
          if (!response.ok || !body.signedUrl) throw new Error(body.error ?? "Aida is unavailable");
          pendingDraftsRef.current = 0;
          // startSession only begins the connection; onConnect says when she is there.
          copilotRef.current.startSession({ signedUrl: body.signedUrl, textOnly: true });
          const deadline = Date.now() + AIDA_START_TIMEOUT_MS;
          while (!copilotReadyRef.current && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 250));
          if (!copilotReadyRef.current) throw new Error(`Aida did not connect within ${AIDA_START_TIMEOUT_MS / 1000} s`);
        } catch (err) {
          console.warn("Aida could not start", err);
          // A try that hangs is closed, and while the two still talk she is tried again.
          if (!copilotReadyRef.current) {
            try {
              copilotRef.current.endSession();
            } catch {
              // nothing was open
            }
          }
          if (callRef.current?.handover_status === "live") {
            setAida("retrying");
            setTimeout(() => void handlersRef.current?.start(), AIDA_RETRY_MS);
          } else {
            setAida("unavailable");
          }
        } finally {
          copilotStartingRef.current = false;
        }
      },
    };
  });

  // --- following the call ---------------------------------------------------------------------------

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const response = await fetch(`/api/admin/calls/live/${callId}?kind=${kind}&after=${lastIdRef.current}`, {
          headers: { "x-aida-staff": staffToken },
          cache: "no-store",
        });
        if (response.status === 401) return onSignOut();
        const body = (await response.json().catch(() => ({}))) as { call?: Call; lines?: Line[]; known?: Known; error?: string };
        if (!response.ok || !body.call) throw new Error(body.error ?? "Could not load the call.");
        if (stopped) return;

        callRef.current = body.call;
        setCall(body.call);
        if (body.known !== undefined) {
          knownRef.current = body.known;
          setKnown(body.known);
        }
        const fresh = (body.lines ?? []).filter((line) => line.id > lastIdRef.current);
        if (fresh.length) {
          linesRef.current = [...linesRef.current, ...fresh];
          lastIdRef.current = fresh[fresh.length - 1].id;
          setLines(linesRef.current);
          handlersRef.current?.feed();
        }
        setError(null);

        const ended = Date.parse(body.call.handover_ended_at ?? "");
        const awaitingNote = body.call.handover_status === "ended" && !body.call.handover_note && Date.now() - ended < NOTE_WAIT_MS;
        if (body.call.on || awaitingNote) timer = setTimeout(tick, POLL_MS);
      } catch (err) {
        if (stopped) return;
        setError(err instanceof Error ? err.message : "Could not load the call.");
        timer = setTimeout(tick, POLL_MS * 2);
      }
    };
    timer = setTimeout(tick, 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [kind, callId, staffToken, onSignOut]);

  // Aida while the colleague and the customer talk, and not a moment longer.
  const status = call?.handover_status ?? null;
  useEffect(() => {
    if (status === "live") {
      const timer = setTimeout(() => void handlersRef.current?.start(), 0);
      return () => clearTimeout(timer);
    }
    if (status && copilotReadyRef.current) copilotRef.current.endSession();
  }, [status]);

  useEffect(
    () => () => {
      if (copilotReadyRef.current) copilotRef.current.endSession();
    },
    [],
  );

  // Clara's part in full, once it is over: the call has ended, or she has handed it over.
  const claraOver = Boolean(call) && (!call?.on || Boolean(call?.handover_status));
  useEffect(() => {
    if (!claraOver) return;
    let stopped = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      tries += 1;
      try {
        const response = await fetch(`/api/admin/calls/live/${callId}/clara?kind=${kind}`, {
          headers: { "x-aida-staff": staffToken },
          cache: "no-store",
        });
        if (response.status === 401) return onSignOut();
        const body = (await response.json().catch(() => ({}))) as Partial<Clara>;
        if (stopped) return;
        if (response.ok && (body.state === "done" || body.state === "none")) return setClara({ state: body.state, lines: body.lines ?? [] });
      } catch {
        // Tried again below, like a transcript that is not ready yet.
      }
      if (stopped) return;
      if (tries >= CLARA_TRIES) return setClara({ state: "none", lines: [] });
      setClara({ state: "pending", lines: [] });
      timer = setTimeout(load, CLARA_RETRY_MS);
    };
    timer = setTimeout(load, 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [claraOver, kind, callId, staffToken, onSignOut]);

  // The clock, while the call is on.
  const on = call?.on ?? false;
  useEffect(() => {
    if (!on) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [on]);

  // The view opens at the top of the tab: it comes into sight, wherever staff clicked.
  useEffect(() => {
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // New lines scroll the transcript, not the page.
  useEffect(() => {
    const box = transcriptRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [lines, clara]);

  // --- what staff see -----------------------------------------------------------------------------------

  const since = Date.parse(call?.started_at ?? "");
  const until = on ? now : Date.parse(call?.ended_at ?? call?.handover_ended_at ?? "") || now;
  const clock = Number.isFinite(since) ? minutesAndSeconds(until - since) : "";

  const handoverBanner: Record<HandoverStatus, { text: string; style: string }> = {
    ringing: { text: `Ringing ${colleague}… ${capitalise(customer)} is on hold.`, style: "bg-amber-50 text-amber-900" },
    live: { text: `${capitalise(colleague)} is talking with ${customer}.`, style: "bg-red-50 text-brand-dark" },
    ended: { text: `${capitalise(colleague)} took the call. It has ended.`, style: "bg-line text-heading" },
    missed: {
      text: `${capitalise(colleague)} did not take the call. The customer heard that NDI will call back.`,
      style: "bg-line text-heading",
    },
    abandoned: { text: "The customer hung up while waiting.", style: "bg-line text-heading" },
    failed: { text: "The call could not be handed over. The customer heard that NDI will call back.", style: "bg-line text-heading" },
  };
  const banner = status
    ? handoverBanner[status]
    : on
      ? { text: `Clara is on the call with ${customer}.`, style: "bg-surface text-heading" }
      : { text: "The call has ended.", style: "bg-line text-heading" };

  const ndiSide = status === "live" || status === "ended" ? capitalise(colleague) : status === "ringing" ? "On hold" : "Clara";
  const speakerName = (speaker: Speaker) => (speaker === "customer" ? capitalise(customer) : speaker === "clara" ? "Clara" : capitalise(colleague));
  const bubble: Record<Speaker, string> = {
    customer: "bg-white text-heading",
    clara: "bg-night text-white",
    colleague: "bg-brand text-white",
  };
  const said = (key: string, speaker: Speaker, text: string) => (
    <p key={key} className={speaker === "customer" ? "" : "text-right"}>
      <span className={`inline-block max-w-[85%] rounded-lg px-3 py-1.5 text-left ${bubble[speaker]}`}>
        <span className="block text-[11px] opacity-70">{speakerName(speaker)}</span>
        <LinkedText text={text} />
      </span>
    </p>
  );
  const handedOverLabel = (
    <p className="py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">Handed over to {colleague}</p>
  );

  // Clara's part in full replaces any live lines of it; the talk with a colleague stays as Twilio wrote it down.
  const claraLines = clara?.state === "done" ? clara.lines : [];
  const handoverStart = call?.handover_started_at ?? null;
  const shownLines = claraLines.length ? lines.filter((line) => saidAfter(line, handoverStart)) : lines;
  const claraPending = claraOver && clara?.state !== "done" && clara?.state !== "none";

  return (
    <section ref={sectionRef} className="animate-fade-up scroll-mt-4 space-y-3 rounded-2xl border-2 border-brand/30 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold text-heading">
            {on && <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden="true" />}
            <span className="truncate">
              {on ? "Live: " : ""}
              {call ? [call.name, call.phone].filter(Boolean).join(" · ") || (kind === "incoming" ? "a call to NDI" : "a call") : "…"}
            </span>
          </h2>
          <p className="text-xs text-muted">
            {kind === "incoming" ? "Called NDI" : "Call list"}
            {call?.handover_status ? ` · hand-over to ${colleague}` : ""}
            {clock && ` · ${clock}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the live view"
          className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 text-xs font-semibold text-heading transition hover:border-heading"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" /> Close
        </button>
      </div>

      {on && (
        <div className="space-y-1.5">
          <LiveSignal staffToken={staffToken} kind={kind} id={callId} customerLabel={capitalise(customer)} ndiLabel={ndiSide} />
          <p className="text-xs text-muted">
            {status
              ? "The sound runs while this view is open. The talk with the colleague is written down in any case, for the customer's memory."
              : "The sound and the transcript run while this view is open, and stop when you close it."}
          </p>
        </div>
      )}
      {on && call?.live_signal && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Twilio refused: {call.live_signal}</p>
      )}

      {call && <p className={`rounded-lg px-3 py-2 text-sm ${banner.style}`}>{banner.text}</p>}
      {call?.handover_note && <p className="rounded-lg bg-surface p-3 text-sm text-heading">{call.handover_note}</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-brand-dark">{error}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <h3 className="text-sm font-semibold text-heading">Conversation</h3>
          <div ref={transcriptRef} className="h-80 space-y-2 overflow-y-auto rounded-lg bg-surface p-3 text-sm">
            {claraLines.length > 0 && (
              <>
                <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-muted">Clara&apos;s part, in full</p>
                {claraLines.map((line, index) => said(`clara-${index}`, line.speaker, line.text))}
                {status && shownLines.length === 0 && handedOverLabel}
              </>
            )}
            {claraLines.length === 0 && shownLines.length === 0 && (
              <p className="text-muted">
                {!call
                  ? "Loading…"
                  : !claraOver
                    ? "Waiting for the first words…"
                    : claraPending
                      ? "Clara's part appears here in full a moment after it ends."
                      : "Nothing was transcribed."}
              </p>
            )}
            {claraLines.length === 0 && shownLines.length > 0 && claraPending && (
              <p className="text-center text-[11px] text-muted">Clara&apos;s part appears here in full a moment after it ends.</p>
            )}
            {shownLines.map((line, index) => {
              const handedOver = saidAfter(line, handoverStart) && (index === 0 || !saidAfter(shownLines[index - 1], handoverStart));
              return (
                <Fragment key={line.id}>
                  {handedOver && handedOverLabel}
                  {said(String(line.id), line.speaker, line.text)}
                </Fragment>
              );
            })}
            {status === "ringing" && on && shownLines.length === 0 && (
              <p className="text-center text-[11px] text-muted">The talk with {colleague} appears here when they join.</p>
            )}
          </div>
        </div>

        <div className="min-w-0 space-y-2">
          {status && (on || suggestions.length > 0) ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-heading">Aida suggests</h3>
                <span className="text-xs text-muted">
                  {aida === "on"
                    ? "listening"
                    : aida === "starting"
                      ? "starting…"
                      : aida === "retrying"
                        ? "trying again…"
                        : aida === "unavailable"
                          ? "unavailable"
                          : "starts when they talk"}
                </span>
              </div>
              {suggestions.length === 0 && (
                <p className="rounded-lg bg-surface p-3 text-sm text-muted">
                  Suggestions for what {colleague} could say appear here after the customer speaks.
                </p>
              )}
              {suggestions.map((suggestion, index) => {
                const note = suggestion.text.match(STAFF_NOTE)?.[1];
                return (
                  <article
                    key={suggestion.id}
                    className={`rounded-lg border p-3 text-sm ${index === 0 ? "border-brand/50 bg-white" : "border-line bg-surface opacity-70"}`}
                  >
                    {note && <span className="mb-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900">{note}</span>}
                    <p className="text-heading">
                      <LinkedText text={suggestion.text.replace(STAFF_NOTE, "")} />
                    </p>
                    {suggestion.replyTo && <p className="mt-1 truncate text-xs text-muted">To: “{suggestion.replyTo}”</p>}
                  </article>
                );
              })}
              <details className="rounded-lg bg-surface p-3 text-sm" open>
                <summary className="cursor-pointer font-semibold text-heading">What Clara learnt</summary>
                <p className="mt-2 text-heading">{call?.handover_summary || "Clara left no summary."}</p>
                {call?.instructions && <p className="mt-2 text-xs text-muted">Staff instructions: {call.instructions}</p>}
              </details>
            </>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-heading">{on ? "Aida suggests" : "Clara's summary"}</h3>
              <p className={`rounded-lg bg-surface p-3 text-sm ${on || !call?.summary ? "text-muted" : "text-heading"}`}>
                {on
                  ? "Aida's suggestions appear here if Clara hands the call over to a colleague."
                  : call?.summary || "ElevenLabs' summary of Clara's part appears here a moment after the call."}
              </p>
              {call?.handover_summary && (
                <p className="rounded-lg bg-surface p-3 text-sm text-heading">
                  <span className="block text-xs font-semibold text-muted">What Clara told {colleague}</span>
                  {call.handover_summary}
                </p>
              )}
              {call?.instructions && <p className="rounded-lg bg-surface p-3 text-xs text-muted">Staff instructions: {call.instructions}</p>}
            </>
          )}
          <details className="rounded-lg bg-surface p-3 text-sm">
            <summary className="cursor-pointer font-semibold text-heading">What NDI already knows about {customer}</summary>
            {known && (known.recent.length > 0 || known.interests.length > 0) ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-heading">
                {known.interests.map((interest) => (
                  <li key={`i-${interest}`}>Interested in: {interest}</li>
                ))}
                {known.recent.map((note) => (
                  <li key={`n-${note}`}>{note}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-muted">Nothing from earlier conversations.</p>
            )}
          </details>
        </div>
      </div>
    </section>
  );
}
