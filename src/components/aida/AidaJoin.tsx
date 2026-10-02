"use client";

import { useEffect, useRef, useState } from "react";
import { AidaHistory } from "./AidaHistory";
import { AidaRoom } from "./AidaRoom";
import { rememberName, RoomClosedError, requestRoom, savedName, type JoinedRoom } from "./types";

/**
 * The customer side, open without any password: join with a code, or open a new room. A customer
 * signed in to their CDA account on the website is recognised and not asked for a name. A room that
 * has ended can still be read (and emailed) with its code, but not joined.
 */
export function AidaJoin({ initialCode }: { initialCode: string }) {
  const [joined, setJoined] = useState<JoinedRoom | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState<string | null>(null);
  const [nameMissing, setNameMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => setName((current) => current || savedName()), 0);
    fetch("/api/aida/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((me: { signedIn?: boolean; name?: string } | null) => {
        if (!cancelled && me?.signedIn && me.name) setAccountName(me.name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  async function enter(path: "/api/aida/rooms" | "/api/aida/join", body: Record<string, string>) {
    // A signed-in customer needs no name: the server takes it from their CDA account.
    const cleanName = accountName ? "" : name.trim();
    if (!accountName && !cleanName) {
      setNameMissing(true);
      nameInputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (cleanName) rememberName(cleanName);
      setJoined(await requestRoom(path, { ...body, name: cleanName }));
    } catch (err) {
      if (err instanceof RoomClosedError) setViewing(err.code);
      else setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (viewing) return <AidaHistory code={viewing} onBack={() => setViewing(null)} />;

  if (joined) {
    return (
      <AidaRoom
        joined={joined}
        onLeave={() => setJoined(null)}
        onViewHistory={() => {
          setViewing(joined.room.code);
          setJoined(null);
        }}
      />
    );
  }

  return (
    <section className="mx-auto w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow-sm">
      <div>
        <h1 className="text-xl font-bold text-cda-dark">Talk to CDA</h1>
        <p className="mt-1 text-sm text-cda-text">
          Join a call with the CDA team. You can talk or type; the conversation is transcribed live.
        </p>
      </div>

      {accountName ? (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          Signed in as <strong>{accountName}</strong>. The CDA team will see your earlier conversations, so you
          don&apos;t need to repeat yourself.
        </p>
      ) : (
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
            placeholder="e.g. Helmi"
            className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal ${
              nameMissing ? "border-cda-red ring-2 ring-cda-red/30" : "border-cda-grey"
            }`}
          />
          {nameMissing && <span className="mt-1 block text-sm font-normal text-cda-red">Enter your name first.</span>}
        </label>
      )}

      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void enter("/api/aida/join", { code });
        }}
      >
        <label className="block text-sm font-semibold text-cda-dark">
          Room code
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="4F2-K9M"
            maxLength={8}
            className="mt-1 w-full rounded-lg border border-cda-grey px-3 py-2 text-sm font-normal uppercase tracking-widest"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="w-full rounded-lg bg-cda-red px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Join the room
        </button>
      </form>

      <div className="border-t border-cda-grey pt-4">
        <p className="text-sm text-cda-text">No code? Open a room and the CDA team will join you.</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void enter("/api/aida/rooms", {})}
          className="mt-2 w-full rounded-lg border border-cda-red px-3 py-2 text-sm font-semibold text-cda-red disabled:opacity-60"
        >
          Open a new room
        </button>
      </div>

      {error && <p className="text-sm text-cda-red">{error}</p>}
      <p className="text-xs text-cda-text">
        NDI demo · not an official CDA service. Headphones give the best sound. A room that has ended can still be
        read with its code.
      </p>
    </section>
  );
}
