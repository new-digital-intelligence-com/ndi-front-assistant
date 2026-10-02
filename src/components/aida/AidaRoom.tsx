"use client";

import { CommitStrategy, ConversationProvider, useConversation, useScribe } from "@elevenlabs/react";
import { DisconnectReason, Room, RoomEvent, Track, type Participant } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MoodMeter, moodColor, moodWord, upsetMood } from "./MoodMeter";
import type { AidaRole, JoinedRoom, LineMood, Person, Suggestion, TimelineLine, WireMessage } from "./types";

// One live Aida room. Voice and messages travel over LiveKit; each browser transcribes only its
// own microphone, so every line is known to come from the person who said it.
//
// Aida, the copilot, runs in exactly one browser: the employee who joined first (the "host"). She
// receives what customers say as questions and what employees say as background, and her drafts
// are sent to employees only, so a customer's browser never even receives them.
//
// The host also rates the mood of each customer line (😊 Mood): staff see a coloured dot on the line
// and a mood meter, and when the customer is frustrated Aida is told so before she drafts her answer.

const TOPIC = "aida";
const encoder = new TextEncoder();
const decoder = new TextDecoder();
/** Aida writes this when a customer message needs no answer ("ok", "thanks"). */
const NO_REPLY = /\[no reply needed\]/i;
/** Notes for staff at the start of a draft, e.g. "[Check]", are never sent to the customer. */
const STAFF_NOTE = /^\s*\[([^\]]+)\]\s*/;
/** How much of the call a new host hands to Aida so she is not starting from nothing. */
const CONTEXT_LINES = 15;

type Status = "connecting" | "connected" | "ended" | "error";

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const copy = { ...record };
  delete copy[key];
  return copy;
}

function roleOf(participant: Participant): AidaRole {
  return participant.attributes?.role === "employee" ? "employee" : "customer";
}

type Props = {
  joined: JoinedRoom;
  onLeave: () => void;
  /** Opens the room's read-only history (with the email option) once the room has ended. */
  onViewHistory?: () => void;
};

export function AidaRoom(props: Props) {
  return (
    <ConversationProvider>
      <RoomView {...props} />
    </ConversationProvider>
  );
}

function RoomView({ joined, onLeave, onViewHistory }: Props) {
  const { ticket, room: info } = joined;
  const isEmployee = ticket.role === "employee";

  const [status, setStatus] = useState<Status>("connecting");
  const [endedMessage, setEndedMessage] = useState("You left the room.");
  const [lines, setLines] = useState<TimelineLine[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [people, setPeople] = useState<Person[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [muted, setMuted] = useState(false);
  const [needsAudioClick, setNeedsAudioClick] = useState(false);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** Set when the customer is signed in to their CDA account and Aida has been given their history. */
  const [knownCustomer, setKnownCustomer] = useState<string | null>(null);
  /** Staff only: the mood of each customer line, by line id. */
  const [moods, setMoods] = useState<Record<string, LineMood>>({});

  const roomRef = useRef<Room | null>(null);
  const audioBoxRef = useRef<HTMLDivElement>(null);
  const listEndRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef<TimelineLine[]>([]);
  const isHostRef = useRef(false);
  const copilotReadyRef = useRef(false);
  const copilotStartingRef = useRef(false);
  const scribeStartingRef = useRef(false);
  /** Customer messages Aida still owes a draft for; anything she says unasked is ignored. */
  const pendingDraftsRef = useRef(0);
  const lastCustomerRef = useRef("the customer");
  /** The customer background last handed to Aida, so it is sent once per Aida session. */
  const contextSentRef = useRef("");
  /** Aida has been told the customer is frustrated (and not yet that they calmed down). */
  const frustratedRef = useRef(false);

  // --- talking to our server and to the room ----------------------------------------------------

  const api = useCallback(
    (path: string, init: RequestInit = {}) =>
      fetch(path, {
        ...init,
        headers: { Authorization: `Bearer ${ticket.token}`, "Content-Type": "application/json" },
      }),
    [ticket.token],
  );

  /** Each person records only what they said or decided, so nothing is stored twice. */
  const save = useCallback(
    (kind: string, text: string | null, ref: string) => {
      void api("/api/aida/events", { method: "POST", body: JSON.stringify({ kind, text, ref }) }).catch(() => {});
    },
    [api],
  );

  /** No `to` means everyone in the room. */
  const send = useCallback((message: WireMessage, to?: string[]) => {
    const room = roomRef.current;
    if (!room || room.state !== "connected" || (to && to.length === 0)) return;
    void room.localParticipant
      .publishData(encoder.encode(JSON.stringify(message)), { reliable: true, topic: TOPIC, destinationIdentities: to })
      .catch(() => {});
  }, []);

  const otherEmployees = useCallback(() => {
    const room = roomRef.current;
    if (!room) return [];
    return [...room.remoteParticipants.values()].filter((p) => roleOf(p) === "employee").map((p) => p.identity);
  }, []);

  const addLine = useCallback((line: TimelineLine) => {
    setLines((current) => (current.some((existing) => existing.id === line.id) ? current : [...current, line]));
  }, []);

  // --- Aida, the copilot (host employee only) ---------------------------------------------------

  const copilot = useConversation({
    onConnect: () => {
      copilotReadyRef.current = true;
      contextSentRef.current = "";
      handlersRef.current?.seedCopilot();
      handlersRef.current?.shareCustomerContext();
    },
    onDisconnect: () => {
      copilotReadyRef.current = false;
      handlersRef.current?.copilotDropped();
    },
    onMessage: ({ message, role }) => {
      if (role === "agent") handlersRef.current?.onDraft(message);
    },
    onError: (message) => console.warn("Aida:", message),
  });
  const copilotRef = useRef(copilot);

  // --- live transcript of my own microphone -----------------------------------------------------

  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    commitStrategy: CommitStrategy.VAD,
    onCommittedTranscript: ({ text }) => handlersRef.current?.onSpoken(text),
    onError: (error) => console.warn("Live transcript:", error),
  });

  // Everything the LiveKit listeners and SDK callbacks call goes through this ref, so they always
  // see the current state instead of the state from when the room was joined.
  const handlersRef = useRef<{
    onWire: (message: WireMessage, from: Participant) => void;
    onSpoken: (text: string) => void;
    onDraft: (message: string) => void;
    seedCopilot: () => void;
    shareCustomerContext: () => void;
    copilotDropped: () => void;
    system: (text: string) => void;
    loadHistory: () => void;
  } | null>(null);

  const feedCopilot = (name: string, role: AidaRole, text: string) => {
    if (!isHostRef.current || !copilotReadyRef.current) return;
    if (role === "customer") {
      pendingDraftsRef.current += 1;
      lastCustomerRef.current = name;
      copilotRef.current.sendUserMessage(`${name}: ${text}`);
    } else {
      copilotRef.current.sendContextualUpdate(`CDA employee ${name} said: ${text}`);
    }
  };

  const tellCopilot = (text: string) => {
    if (isHostRef.current && copilotReadyRef.current) copilotRef.current.sendContextualUpdate(text);
  };

  /** Claude's rating of one customer line, or null if it does not come back quickly. */
  const rateLine = async (lineId: string, text: string): Promise<LineMood | null> => {
    try {
      const response = await api("/api/aida/mood", {
        method: "POST",
        body: JSON.stringify({ lineId, text }),
        signal: AbortSignal.timeout(7000),
      });
      return response.ok ? ((await response.json()) as LineMood) : null;
    } catch {
      return null;
    }
  };

  /**
   * A customer line reaching the host: its mood is rated first (about a second), shown to staff and
   * shared with the other employees; Aida hears about a frustrated customer before the line itself,
   * so her draft for it already opens with an apology. A line is never lost if the rating fails.
   */
  const rateThenFeed = async (lineId: string, name: string, text: string) => {
    const mood = await rateLine(lineId, text);
    if (mood) {
      setMoods((current) => ({ ...current, [lineId]: mood }));
      send({ type: "mood", lineId, mood }, otherEmployees());
      if (upsetMood(mood)) {
        frustratedRef.current = true;
        tellCopilot(
          `[Customer mood] ${name} sounds ${moodWord(mood).toLowerCase()} (frustration ${Math.round(mood.frustration * 100)}%). ` +
            "In your next draft: start with a short, sincere apology, acknowledge the problem in their own words, stay calm " +
            "and brief, give one clear next step, and offer to escalate to a manager or arrange a call back if they want.",
        );
      } else if (frustratedRef.current && mood.score >= 0) {
        frustratedRef.current = false;
        tellCopilot(`[Customer mood] ${name} sounds calmer now. Go back to your normal friendly tone.`);
      }
    }
    feedCopilot(name, "customer", text);
  };

  /** Something I said or typed: show it, send it to the room, record it, and let Aida hear it. */
  const sayLine = (kind: "speech" | "chat", text: string) => {
    const id = crypto.randomUUID();
    addLine({ id, kind, name: ticket.name, role: ticket.role, text, mine: true });
    send({ type: kind, id, text });
    save(kind, text, id);
    feedCopilot(ticket.name, ticket.role, text);
  };

  const applyApproved = (suggestionId: string, text: string, byName: string, mine = false) => {
    addLine({ id: `a-${suggestionId}`, kind: "approved", name: byName, role: "employee", text, approvedBy: byName, mine });
    setSuggestions((current) =>
      current.map((s) => (s.id === suggestionId ? { ...s, status: "approved", decidedBy: byName } : s)),
    );
    tellCopilot(`The CDA employee sent the customer this reply: ${text}`);
  };

  const startCopilot = async () => {
    if (copilotStartingRef.current || copilotReadyRef.current) return;
    copilotStartingRef.current = true;
    try {
      const response = await api("/api/aida/copilot", { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { signedUrl?: string; error?: string };
      if (!response.ok || !body.signedUrl) throw new Error(body.error ?? "Aida is unavailable");
      pendingDraftsRef.current = 0;
      await copilotRef.current.startSession({ signedUrl: body.signedUrl, textOnly: true });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Aida is unavailable");
    } finally {
      copilotStartingRef.current = false;
    }
  };

  const startScribe = async () => {
    if (scribeStartingRef.current) return;
    scribeStartingRef.current = true;
    try {
      const response = await api("/api/aida/scribe-token", { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { token?: string };
      if (!response.ok || !body.token) throw new Error("no token");
      await scribe.connect({
        token: body.token,
        microphone: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setNotice("The live transcript is unavailable right now. You can still talk and type.");
    } finally {
      scribeStartingRef.current = false;
    }
  };

  useEffect(() => {
    copilotRef.current = copilot;
    linesRef.current = lines;
    isHostRef.current = isHost;
    handlersRef.current = {
      onWire(message, from) {
        const name = from.name || from.identity;
        const role = roleOf(from);
        switch (message.type) {
          case "speech":
          case "chat":
            addLine({ id: message.id, kind: message.type, name, role, text: message.text });
            // Only the host rates customer lines (once for the whole room) and feeds Aida.
            if (role === "customer" && isEmployee && isHostRef.current) void rateThenFeed(message.id, name, message.text);
            else feedCopilot(name, role, message.text);
            return;
          case "mood":
            // Moods come from the host employee, and only employees are shown them.
            if (!isEmployee || role !== "employee" || typeof message.mood?.frustration !== "number") return;
            setMoods((current) => ({ ...current, [message.lineId]: message.mood }));
            return;
          case "suggestion":
            // Drafts only ever come from an employee, and only employees look at them.
            if (!isEmployee || role !== "employee") return;
            setSuggestions((current) =>
              current.some((s) => s.id === message.id)
                ? current
                : [{ id: message.id, text: message.text, replyTo: message.replyTo, status: "pending" }, ...current],
            );
            return;
          case "approved":
            // Only an employee can put words in CDA's mouth; a customer's browser cannot fake this.
            if (role !== "employee") return;
            applyApproved(message.suggestionId, message.text, name);
            return;
          case "declined":
            if (!isEmployee || role !== "employee") return;
            setSuggestions((current) =>
              current.map((s) => (s.id === message.suggestionId ? { ...s, status: "declined", decidedBy: name } : s)),
            );
            tellCopilot("The CDA employee chose not to send your last draft.");
        }
      },
      onSpoken(text) {
        const clean = text.trim();
        if (clean) sayLine("speech", clean);
      },
      onDraft(message) {
        if (pendingDraftsRef.current <= 0) return;
        pendingDraftsRef.current -= 1;
        const text = message.trim();
        if (!text || NO_REPLY.test(text)) return;
        const suggestion: Suggestion = {
          id: crypto.randomUUID(),
          text,
          replyTo: lastCustomerRef.current,
          status: "pending",
        };
        setSuggestions((current) => [suggestion, ...current]);
        send({ type: "suggestion", id: suggestion.id, text, replyTo: suggestion.replyTo }, otherEmployees());
        save("suggestion", text, suggestion.id);
      },
      seedCopilot() {
        const recent = linesRef.current.filter((line) => line.kind !== "system").slice(-CONTEXT_LINES);
        if (recent.length === 0) return;
        const transcript = recent
          .map((line) =>
            line.kind === "approved"
              ? `CDA reply: ${line.text}`
              : `${line.name} (${line.role === "customer" ? "customer" : "CDA"}): ${line.text}`,
          )
          .join("\n");
        copilotRef.current.sendContextualUpdate(`The call so far:\n${transcript}`);
      },
      shareCustomerContext() {
        // What CDA already knows about a signed-in customer (other channels, earlier calls), so
        // Aida's drafts can build on it. Only the host runs Aida, so only the host asks.
        if (!isHostRef.current || !copilotReadyRef.current) return;
        void api("/api/aida/context")
          .then((response) => (response.ok ? response.json() : null))
          .then((context: { known?: boolean; name?: string | null; text?: string } | null) => {
            if (!context?.known || !context.text || context.text === contextSentRef.current) return;
            contextSentRef.current = context.text;
            copilotRef.current.sendContextualUpdate(context.text);
            setKnownCustomer(context.name ?? "the customer");
          })
          .catch(() => {});
      },
      copilotDropped() {
        // Aida's session has a time limit; a host keeps her running for as long as the room is open.
        if (isHostRef.current && roomRef.current?.state === "connected") {
          setTimeout(() => void startCopilot(), 1500);
        }
      },
      system(text) {
        addLine({ id: crypto.randomUUID(), kind: "system", name: "", role: "system", text });
      },
      loadHistory() {
        void api("/api/aida/events")
          .then((response) => (response.ok ? response.json() : { events: [] }))
          .then(({ events }: { events: HistoryEvent[] }) => {
            const history = historyToState(events, ticket.identity);
            setLines((current) => [
              ...history.lines,
              ...current.filter((line) => !history.lines.some((h) => h.id === line.id)),
            ]);
            if (isEmployee) {
              setSuggestions((current) => [
                ...current,
                ...history.suggestions.filter((h) => !current.some((s) => s.id === h.id)),
              ]);
            }
          })
          .catch(() => {});
        // Staff joining late also get the moods rated so far.
        if (isEmployee) {
          void api("/api/aida/mood")
            .then((response) => (response.ok ? response.json() : { moods: {} }))
            .then(({ moods: saved }: { moods: Record<string, LineMood> }) => setMoods((current) => ({ ...saved, ...current })))
            .catch(() => {});
        }
      },
    };
  });

  // --- joining the room ---------------------------------------------------------------------------

  useEffect(() => {
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    let cancelled = false;

    const refreshPeople = () => {
      const everyone = [room.localParticipant, ...room.remoteParticipants.values()];
      const speaking = new Set(room.activeSpeakers.map((p) => p.identity));
      const roleFor = (p: Participant) => (p === room.localParticipant ? ticket.role : roleOf(p));
      setPeople(
        everyone.map((p) => ({
          identity: p.identity,
          name: p.name || p.identity,
          role: roleFor(p),
          speaking: speaking.has(p.identity),
          isMe: p === room.localParticipant,
        })),
      );
      // The employee who joined first hosts Aida. Every browser works this out the same way, and
      // when the host leaves the next employee takes over by themselves.
      const employees = everyone
        .filter((p) => roleFor(p) === "employee")
        .sort(
          (a, b) =>
            (a.joinedAt?.getTime() ?? 0) - (b.joinedAt?.getTime() ?? 0) || a.identity.localeCompare(b.identity),
        );
      setIsHost(employees[0]?.identity === room.localParticipant.identity);
    };

    room
      .on(RoomEvent.ParticipantConnected, (p) => {
        refreshPeople();
        handlersRef.current?.system(`${p.name || "Someone"} joined`);
        if (roleOf(p) === "customer") handlersRef.current?.shareCustomerContext();
      })
      .on(RoomEvent.ParticipantDisconnected, (p) => {
        refreshPeople();
        handlersRef.current?.system(`${p.name || "Someone"} left`);
      })
      .on(RoomEvent.ActiveSpeakersChanged, refreshPeople)
      .on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) audioBoxRef.current?.appendChild(track.attach());
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((element) => element.remove()))
      .on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        if (!participant || topic !== TOPIC) return;
        try {
          handlersRef.current?.onWire(JSON.parse(decoder.decode(payload)) as WireMessage, participant);
        } catch {
          // Not one of ours; ignore it.
        }
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, () => setNeedsAudioClick(!room.canPlaybackAudio))
      .on(RoomEvent.Disconnected, (reason) => {
        if (cancelled) return;
        setEndedMessage(reason === DisconnectReason.ROOM_DELETED ? "CDA ended this room." : "You left the room.");
        setStatus("ended");
      });

    room
      .connect(ticket.url, ticket.token)
      .then(async () => {
        if (cancelled) return;
        setStatus("connected");
        refreshPeople();
        await room.localParticipant.setMicrophoneEnabled(true).catch(() => {
          setMuted(true);
          setNotice("Your microphone is not available, so you can type but not talk.");
        });
        setNeedsAudioClick(!room.canPlaybackAudio);
        handlersRef.current?.loadHistory();
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      room.removeAllListeners();
      void room.disconnect();
      roomRef.current = null;
    };
  }, [ticket.url, ticket.token, ticket.role]);

  // --- start and stop Aida and the transcript as the room changes ----------------------------------

  // Started from a timer rather than inside the effect body: both may update state once they finish.
  useEffect(() => {
    if (!isEmployee || status !== "connected") return;
    const timer = setTimeout(() => {
      if (isHost) void startCopilot();
      else if (copilotReadyRef.current) void copilotRef.current.endSession();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to the host changing, nothing else
  }, [isHost, status, isEmployee]);

  // The transcript starts only once a CDA employee is in the room: until then there is nobody to
  // help, and it would only spend transcription minutes.
  const employeePresent = people.some((person) => person.role === "employee");
  const shouldTranscribe = status === "connected" && !muted && employeePresent;

  useEffect(() => {
    const timer = setTimeout(() => {
      if (shouldTranscribe && scribe.status === "disconnected") void startScribe();
      if (!shouldTranscribe && (scribe.isConnected || scribe.status === "connecting")) scribe.disconnect();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to the room state, nothing else
  }, [shouldTranscribe, scribe.status, scribe.isConnected]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines, scribe.partialTranscript]);

  // --- actions ------------------------------------------------------------------------------------

  async function toggleMute() {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    // Unmuting asks the browser for the microphone again: someone who allowed it, or closed the
    // app that was holding it, gets their voice back without reloading the page.
    let failed = false;
    await room.localParticipant.setMicrophoneEnabled(!next).catch(() => {
      failed = true;
    });
    if (failed && !next) {
      setNotice("Your microphone is still not available. Allow it in the browser, then try again.");
      return;
    }
    if (!next) setNotice(null);
    setMuted(next);
  }

  function leave() {
    scribe.disconnect();
    void copilot.endSession();
    void roomRef.current?.disconnect();
    onLeave();
  }

  async function endRoom() {
    if (!window.confirm("End this room for everyone?")) return;
    await api("/api/aida/close", { method: "POST" }).catch(() => {});
  }

  async function copyInvite() {
    const link = `${window.location.origin}/aida/join?code=${info.code.replace("-", "")}`;
    await navigator.clipboard.writeText(link).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function approve(suggestion: Suggestion) {
    const raw = editing[suggestion.id] ?? suggestion.text;
    const text = raw.replace(STAFF_NOTE, "").trim();
    if (!text) return;
    setEditing((current) => without(current, suggestion.id));
    applyApproved(suggestion.id, text, ticket.name, true);
    send({ type: "approved", suggestionId: suggestion.id, text });
    save("approved", text, suggestion.id);
  }

  function decline(suggestion: Suggestion) {
    setSuggestions((current) =>
      current.map((s) => (s.id === suggestion.id ? { ...s, status: "declined", decidedBy: ticket.name } : s)),
    );
    send({ type: "declined", suggestionId: suggestion.id }, otherEmployees());
    save("declined", null, suggestion.id);
    tellCopilot("The CDA employee chose not to send your last draft.");
  }

  function submitChat(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || status !== "connected") return;
    setDraft("");
    sayLine("chat", text);
  }

  // --- rendering ----------------------------------------------------------------------------------

  if (status === "ended" || status === "error") {
    return (
      <section className="mx-auto max-w-md rounded-xl bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-heading">{status === "error" ? "Could not join the room" : "Room closed"}</h1>
        <p className="mt-2 text-sm text-muted">
          {status === "error" ? "Please check your connection and try again." : endedMessage}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {status === "ended" && onViewHistory && (
            <button
              type="button"
              onClick={onViewHistory}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
            >
              See the conversation &amp; email it
            </button>
          )}
          <button
            type="button"
            onClick={onLeave}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-heading"
          >
            Back
          </button>
        </div>
      </section>
    );
  }

  const pending = suggestions.filter((s) => s.status === "pending");
  const decided = suggestions.filter((s) => s.status !== "pending").slice(0, 5);
  const host = people.find((person) => person.role === "employee" && (person.isMe ? isHost : !isHost));

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold text-heading">{info.title ?? "Aida room"}</h1>
          <p className="text-xs text-muted">
            Room code <strong className="tracking-widest text-heading">{info.code}</strong>
            {" · "}
            {status === "connecting" ? "connecting…" : `${people.length} in the room`}
            {" · "}
            {isEmployee ? "You are CDA staff" : "You are the customer"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={copyInvite} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-heading">
            {copied ? "Link copied" : "Copy invite link"}
          </button>
          <button
            type="button"
            onClick={toggleMute}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${muted ? "bg-brand text-white" : "border border-line text-heading"}`}
          >
            {muted ? "Unmute" : "Mute"}
          </button>
          {isEmployee && (
            <button type="button" onClick={endRoom} className="rounded-full border border-brand px-3 py-1.5 text-xs font-semibold text-brand">
              End room
            </button>
          )}
          <button type="button" onClick={leave} className="rounded-full bg-heading px-3 py-1.5 text-xs font-semibold text-white">
            Leave
          </button>
        </div>
      </header>

      <ul className="flex flex-wrap gap-2">
        {people.map((person) => (
          <li
            key={person.identity}
            className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs shadow-sm ${
              person.speaking ? "bg-brand text-white" : "bg-white text-heading"
            }`}
          >
            <span aria-hidden="true">{person.speaking ? "🔊" : "🎙"}</span>
            <span className="font-semibold">{person.isMe ? `${person.name} (you)` : person.name}</span>
            <span className={person.speaking ? "text-white/80" : "text-muted"}>
              {person.role === "employee" ? "CDA" : "customer"}
            </span>
          </li>
        ))}
      </ul>

      {needsAudioClick && (
        <button
          type="button"
          onClick={() => void roomRef.current?.startAudio()}
          className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white"
        >
          Click here to hear the others
        </button>
      )}
      {notice && (
        <p className="flex items-start justify-between gap-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-brand-dark">
          {notice}
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            ✕
          </button>
        </p>
      )}

      <div className={isEmployee ? "grid gap-4 lg:grid-cols-[1fr_380px]" : "grid"}>
        <section className="flex h-[78dvh] min-h-[520px] flex-col overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="flex-1 space-y-3 overflow-y-auto bg-surface p-4">
            {lines.length === 0 && (
              <p className="text-center text-sm text-muted">Say hello, or type a message below.</p>
            )}
            {lines.map((line) => (
              <LineView key={line.id} line={line} viewerRole={ticket.role} mood={isEmployee ? moods[line.id] : undefined} />
            ))}
            {scribe.partialTranscript && (
              <p className="text-right text-sm italic text-muted">{scribe.partialTranscript}…</p>
            )}
            <div ref={listEndRef} />
          </div>
          <p className="border-t border-line px-4 py-1.5 text-xs text-muted">
            {transcriptStatus({ muted, employeePresent, isEmployee, scribeStatus: scribe.status })}
          </p>
          <form onSubmit={submitChat} className="flex gap-2 border-t border-line p-3">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Type a message…"
              maxLength={2000}
              className="flex-1 rounded-full border border-line px-4 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={!draft.trim() || status !== "connected"}
              className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </section>

        {isEmployee && (
          <aside className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm lg:max-h-[75dvh] lg:overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-heading">Aida suggests</h2>
              <span className="rounded-full bg-line px-2.5 py-0.5 text-xs text-muted">
                {isHost
                  ? copilot.status === "connected"
                    ? "Listening"
                    : "Starting…"
                  : host
                    ? `Run by ${host.name}`
                    : "Waiting"}
              </span>
            </div>
            <p className="text-xs text-muted">
              Only CDA staff see this. Approve a draft to send it to the customer in the chat.
            </p>
            <MoodMeter
              lines={lines
                .filter((line) => line.role === "customer" && moods[line.id])
                .map((line) => ({ id: line.id, text: line.text, mood: moods[line.id] }))}
              aidaAdapts={isHost && copilot.status === "connected"}
            />
            {knownCustomer && (
              <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
                <strong>{knownCustomer}</strong> is signed in to their CDA account. Aida has their earlier
                conversations from other channels.
              </p>
            )}

            {pending.length === 0 && (
              <p className="rounded-lg bg-surface p-3 text-sm text-muted">
                A draft appears here when the customer speaks or types.
              </p>
            )}

            {pending.map((suggestion) => {
              const note = suggestion.text.match(STAFF_NOTE)?.[1];
              const isEditing = suggestion.id in editing;
              return (
                <article key={suggestion.id} className="rounded-lg border border-brand/40 p-3">
                  <p className="text-xs text-muted">Reply to {suggestion.replyTo}</p>
                  {note && (
                    <p className="mt-1 inline-block rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-brand-dark">
                      {note}
                    </p>
                  )}
                  {isEditing ? (
                    <textarea
                      value={editing[suggestion.id]}
                      onChange={(event) => setEditing((current) => ({ ...current, [suggestion.id]: event.target.value }))}
                      rows={4}
                      className="mt-2 w-full rounded-lg border border-line p-2 text-sm"
                    />
                  ) : (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-heading">
                      {suggestion.text.replace(STAFF_NOTE, "")}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => approve(suggestion)}
                      className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Approve &amp; send
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditing((current) =>
                          isEditing
                            ? without(current, suggestion.id)
                            : { ...current, [suggestion.id]: suggestion.text.replace(STAFF_NOTE, "") },
                        )
                      }
                      className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-heading"
                    >
                      {isEditing ? "Cancel edit" : "Edit"}
                    </button>
                    <button
                      type="button"
                      onClick={() => decline(suggestion)}
                      className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted"
                    >
                      Decline
                    </button>
                  </div>
                </article>
              );
            })}

            {decided.length > 0 && (
              <div className="space-y-2 border-t border-line pt-3">
                <p className="text-xs font-semibold text-muted">Recent decisions</p>
                {decided.map((suggestion) => (
                  <p key={suggestion.id} className="text-xs text-muted">
                    <span className={suggestion.status === "approved" ? "font-semibold text-green-700" : "font-semibold"}>
                      {suggestion.status === "approved" ? "Sent" : "Declined"}
                    </span>
                    {suggestion.decidedBy ? ` by ${suggestion.decidedBy}` : ""}: {suggestion.text.replace(STAFF_NOTE, "").slice(0, 90)}
                    {suggestion.text.length > 90 ? "…" : ""}
                  </p>
                ))}
              </div>
            )}
          </aside>
        )}
      </div>

      <div ref={audioBoxRef} className="hidden" />
    </div>
  );
}

export function LineView({ line, viewerRole, mood }: { line: TimelineLine; viewerRole: AidaRole; mood?: LineMood }) {
  if (line.kind === "system") {
    return <p className="text-center text-xs text-muted">{line.text}</p>;
  }
  // An approved draft is the staff member's own answer: same bubble, same side, their name on it.
  // Where the words came from is between Aida and the staff, and it stays in the drafts panel.
  const who = line.mine
    ? "You"
    : line.kind === "approved"
      ? line.approvedBy || "CDA Support"
      : line.name;
  // My side of the conversation is on the right, the other side on the left, as in any chat app:
  // staff see CDA on the right, a customer sees their own messages there.
  const mySide = line.role === viewerRole;
  return (
    <div className={`flex ${mySide ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2 shadow-sm ${mySide ? "bg-heading text-white" : "bg-white text-heading"}`}
      >
        {/* Spoken or typed makes no difference to the reader: a message is a message. */}
        <p className={`text-xs font-semibold ${mySide ? "text-white/70" : "text-muted"}`}>
          {who} · {line.role === "employee" ? "CDA" : "customer"}
          {/* Staff only: how the customer sounded. The dot carries the colour, the word says it. */}
          {mood && line.role === "customer" && (
            <span
              className="ms-2 inline-flex items-center gap-1"
              title={`Sentiment ${mood.score.toFixed(1)} · frustration ${Math.round(mood.frustration * 100)}%`}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: moodColor(mood) }} aria-hidden="true" />
              {moodWord(mood)}
            </span>
          )}
        </p>
        <p className="mt-0.5 whitespace-pre-wrap text-sm">{line.text}</p>
      </div>
    </div>
  );
}

function transcriptStatus({
  muted,
  employeePresent,
  isEmployee,
  scribeStatus,
}: {
  muted: boolean;
  employeePresent: boolean;
  isEmployee: boolean;
  scribeStatus: string;
}) {
  if (muted) return "You are muted, so nothing you say is transcribed.";
  if (!employeePresent) return "The live transcript starts when a CDA employee joins.";
  if (scribeStatus === "connecting") return "Starting the live transcript…";
  if (scribeStatus === "error") return "The live transcript is unavailable. You can still type.";
  if (scribeStatus === "connected" || scribeStatus === "transcribing") {
    return `🎙 Live transcript on · headphones help${isEmployee ? "" : " · CDA staff can see what you say"}`;
  }
  return "Live transcript off.";
}

export type HistoryEvent = {
  id: number;
  kind: "speech" | "chat" | "suggestion" | "approved" | "declined";
  author_identity: string;
  author_name: string | null;
  author_role: AidaRole;
  text: string | null;
  ref: string | null;
};

/** Rebuilds the timeline and the drafts from the saved record, for someone joining late. */
export function historyToState(events: HistoryEvent[], myIdentity: string) {
  const lines: TimelineLine[] = [];
  const suggestions = new Map<string, Suggestion>();
  for (const event of events) {
    const name = event.author_name ?? "";
    if (event.kind === "speech" || event.kind === "chat") {
      lines.push({
        id: event.ref ?? `e${event.id}`,
        kind: event.kind,
        name,
        role: event.author_role,
        text: event.text ?? "",
        mine: event.author_identity === myIdentity,
      });
    } else if (event.kind === "suggestion" && event.ref) {
      suggestions.set(event.ref, { id: event.ref, text: event.text ?? "", replyTo: "the customer", status: "pending" });
    } else if (event.kind === "approved" && event.ref) {
      lines.push({
        id: `a-${event.ref}`,
        kind: "approved",
        name,
        role: "employee",
        text: event.text ?? "",
        approvedBy: name,
        mine: event.author_identity === myIdentity,
      });
      const suggestion = suggestions.get(event.ref);
      if (suggestion) Object.assign(suggestion, { status: "approved", decidedBy: name });
    } else if (event.kind === "declined" && event.ref) {
      const suggestion = suggestions.get(event.ref);
      if (suggestion) Object.assign(suggestion, { status: "declined", decidedBy: name });
    }
  }
  return { lines, suggestions: [...suggestions.values()].reverse() };
}
