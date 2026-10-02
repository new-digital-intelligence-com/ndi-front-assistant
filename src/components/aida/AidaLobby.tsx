"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AidaHistory } from "./AidaHistory";
import { AidaRoom } from "./AidaRoom";
import { rememberName, RoomClosedError, requestRoom, savedName, type JoinedRoom } from "./types";

type OpenRoom = {
  code: string;
  title: string | null;
  createdByRole: "employee" | "customer";
  createdByName: string | null;
  createdAt: string;
  closedAt: string;
};

type RoomLists = { open: OpenRoom[]; closed: OpenRoom[] };

const REFRESH_MS = 10_000;

/**
 * The staff password screen of the admin page (/admin). The Aida staff password is asked for once
 * per browser tab: open an invite link in a new tab and you are a customer there, which is how to
 * test both sides.
 */
export function StaffSignIn({ onSignedIn }: { onSignedIn: (token: string) => void }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setName((current) => current || savedName()), 0);
    return () => clearTimeout(timer);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Please enter your name.");
      return;
    }
    setBusy(true);
    setError(null);
    const response = await fetch("/api/aida/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const body = (await response.json().catch(() => ({}))) as { token?: string; error?: string };
    setBusy(false);
    if (!response.ok || !body.token) {
      setError(body.error ?? "Could not sign in");
      return;
    }
    // The name is asked here once, so every Join in the lobby just works.
    rememberName(cleanName);
    onSignedIn(body.token);
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <form onSubmit={submit} className="space-y-3 rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-cda-dark">CDA staff</h1>
        <p className="text-sm text-cda-text">
          Enter the staff password to manage Aida rooms, email replies and customers.
        </p>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your name"
          maxLength={40}
          autoComplete="name"
          autoFocus
          className="w-full rounded-lg border border-cda-grey px-3 py-2 text-sm"
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Aida staff password"
          autoComplete="current-password"
          className="w-full rounded-lg border border-cda-grey px-3 py-2 text-sm"
        />
        {error && <p className="text-sm text-cda-red">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password || !name.trim()}
          className="w-full rounded-lg bg-cda-red px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Sign in as staff
        </button>
      </form>
    </div>
  );
}

/** The "Aida rooms" tab of the admin page: create, join, close and read rooms as CDA staff. */
export function Lobby({ staffToken, onSignOut }: { staffToken: string; onSignOut: () => void }) {
  const [joined, setJoined] = useState<JoinedRoom | null>(null);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [rooms, setRooms] = useState<RoomLists>({ open: [], closed: [] });
  /** A room whose read-only history is on screen. */
  const [viewing, setViewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nameMissing, setNameMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const loadRooms = useCallback(async (): Promise<RoomLists> => {
    const response = await fetch("/api/aida/rooms", { headers: { "x-aida-staff": staffToken } });
    // The password was changed or the sign-in expired: back to the password screen.
    if (response.status === 401) {
      onSignOut();
      return { open: [], closed: [] };
    }
    if (!response.ok) return { open: [], closed: [] };
    const body = (await response.json()) as { rooms: OpenRoom[]; closed?: OpenRoom[] };
    return { open: body.rooms, closed: body.closed ?? [] };
  }, [staffToken, onSignOut]);

  useEffect(() => {
    let cancelled = false;
    const nameTimer = setTimeout(() => setName((current) => current || savedName()), 0);
    const refresh = () =>
      loadRooms()
        .then((lists) => {
          if (!cancelled) setRooms(lists);
        })
        .catch(() => {});
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      clearTimeout(nameTimer);
      clearInterval(timer);
    };
  }, [loadRooms]);

  async function enter(path: "/api/aida/rooms" | "/api/aida/join", body: Record<string, string>) {
    const cleanName = name.trim();
    if (!cleanName) {
      // Point at the box itself: a message somewhere else on the page is easy to miss.
      setNameMissing(true);
      nameInputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      rememberName(cleanName);
      setJoined(await requestRoom(path, { ...body, name: cleanName }, staffToken));
    } catch (err) {
      // A room that has ended cannot be joined, but its history can be read.
      if (err instanceof RoomClosedError) setViewing(err.code);
      else setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function closeRoom(roomCode: string) {
    if (!window.confirm(`Close room ${roomCode}? Everyone in it is disconnected.`)) return;
    setBusy(true);
    setError(null);
    const response = await fetch("/api/aida/close", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-aida-staff": staffToken },
      body: JSON.stringify({ code: roomCode }),
    }).catch(() => null);
    if (!response?.ok) setError("Could not close the room. Please try again.");
    setRooms(await loadRooms().catch(() => rooms));
    setBusy(false);
  }

  if (viewing) {
    return (
      <AidaHistory
        code={viewing}
        staffToken={staffToken}
        onBack={() => {
          setViewing(null);
          void loadRooms().then(setRooms).catch(() => {});
        }}
      />
    );
  }

  if (joined) {
    return (
      <AidaRoom
        joined={joined}
        onLeave={() => {
          setJoined(null);
          void loadRooms().then(setRooms).catch(() => {});
        }}
        onViewHistory={() => {
          setViewing(joined.room.code);
          setJoined(null);
        }}
      />
    );
  }

  const waiting = rooms.open.filter((room) => room.createdByRole === "customer");
  const staffRooms = rooms.open.filter((room) => room.createdByRole === "employee");

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <div className="space-y-4">
        <section className="space-y-4 rounded-xl bg-white p-5 shadow-sm">
          <div>
            <h1 className="text-xl font-bold text-cda-dark">Aida rooms</h1>
            <p className="mt-1 text-sm text-cda-text">
              Live calls with a customer. Aida listens and drafts answers that only CDA staff see; you approve
              what gets sent.
            </p>
          </div>

          <label className="block text-sm font-semibold text-cda-dark">
            Your name
            <input
              ref={nameInputRef}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setNameMissing(false);
              }}
              maxLength={40}
              placeholder="e.g. Sarah"
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal ${
                nameMissing ? "border-cda-red ring-2 ring-cda-red/30" : "border-cda-grey"
              }`}
            />
            {nameMissing && <span className="mt-1 block text-sm font-normal text-cda-red">Enter your name to join or create a room.</span>}
          </label>

          <form
            className="space-y-2 border-t border-cda-grey pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void enter("/api/aida/rooms", { title: title.trim() });
            }}
          >
            <p className="text-sm font-semibold text-cda-dark">Start a new room</p>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={60}
              placeholder="Room name (optional)"
              className="w-full rounded-lg border border-cda-grey px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-cda-red px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Create room
            </button>
          </form>

          <form
            className="space-y-2 border-t border-cda-grey pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void enter("/api/aida/join", { code });
            }}
          >
            <p className="text-sm font-semibold text-cda-dark">Join with a code</p>
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="4F2-K9M"
                maxLength={8}
                className="min-w-0 flex-1 rounded-lg border border-cda-grey px-3 py-2 text-sm uppercase tracking-widest"
              />
              <button
                type="submit"
                disabled={busy || !code.trim()}
                className="rounded-lg border border-cda-red px-4 py-2 text-sm font-semibold text-cda-red disabled:opacity-60"
              >
                Join
              </button>
            </div>
          </form>

          {error && <p className="text-sm text-cda-red">{error}</p>}
        </section>
      </div>

      <section className="space-y-4">
        <RoomList
          heading="Customers waiting"
          empty="No customer is waiting right now."
          rooms={waiting}
          highlight
          busy={busy}
          onJoin={(roomCode) => void enter("/api/aida/join", { code: roomCode })}
          onClose={(roomCode) => void closeRoom(roomCode)}
        />
        <RoomList
          heading="Staff rooms"
          empty="No other open rooms."
          rooms={staffRooms}
          busy={busy}
          onJoin={(roomCode) => void enter("/api/aida/join", { code: roomCode })}
          onClose={(roomCode) => void closeRoom(roomCode)}
        />
        <ClosedRoomList rooms={rooms.closed} onView={setViewing} />
        <p className="text-xs text-cda-text">
          To test as a customer, open the room&apos;s invite link in a new tab. Staff sign-in only applies to
          this tab, so the new tab joins as the customer.
        </p>
      </section>
    </div>
  );
}

function RoomList({
  heading,
  empty,
  rooms,
  highlight = false,
  busy,
  onJoin,
  onClose,
}: {
  heading: string;
  empty: string;
  rooms: OpenRoom[];
  highlight?: boolean;
  busy: boolean;
  onJoin: (code: string) => void;
  onClose: (code: string) => void;
}) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-cda-dark">
        {heading} <span className="text-sm font-normal text-cda-text">({rooms.length})</span>
      </h2>
      {rooms.length === 0 ? (
        <p className="mt-2 text-sm text-cda-text">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rooms.map((room) => (
            <li
              key={room.code}
              className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${
                highlight ? "border border-cda-red/40 bg-red-50/50" : "bg-cda-grey-light"
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-cda-dark">{room.title ?? "Untitled room"}</span>
                <span className="block text-xs text-cda-text">
                  {room.code} · started by {room.createdByName ?? "someone"} ·{" "}
                  {new Date(room.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </span>
              <span className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onClose(room.code)}
                  className="rounded-full border border-cda-grey bg-white px-3 py-1.5 text-xs font-semibold text-cda-text disabled:opacity-60"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onJoin(room.code)}
                  className="rounded-full bg-cda-red px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  Join
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Rooms that have ended: read-only, never reopened, but their history can be read and emailed. */
function ClosedRoomList({ rooms, onView }: { rooms: OpenRoom[]; onView: (code: string) => void }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-cda-dark">
        Closed rooms <span className="text-sm font-normal text-cda-text">({rooms.length})</span>
      </h2>
      {rooms.length === 0 ? (
        <p className="mt-2 text-sm text-cda-text">No closed rooms yet.</p>
      ) : (
        <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
          {rooms.map((room) => (
            <li key={room.code} className="flex items-center justify-between gap-3 rounded-lg bg-cda-grey-light px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-cda-dark">{room.title ?? "Untitled room"}</span>
                <span className="block text-xs text-cda-text">
                  {room.code} · {room.createdByRole === "customer" ? "customer" : "staff"} room by{" "}
                  {room.createdByName ?? "someone"} · ended{" "}
                  {new Date(room.closedAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onView(room.code)}
                className="shrink-0 rounded-full border border-cda-grey bg-white px-4 py-1.5 text-xs font-semibold text-cda-dark"
              >
                View
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
