"use client";

import { useEffect, useState } from "react";
import { EmailTranscriptForm, postEmail } from "../EmailTranscriptForm";
import { historyToState, LineView, type HistoryEvent } from "./AidaRoom";

type HistoryRoom = { code: string; title: string | null; active: boolean; createdAt: string; endedAt: string | null };

const when = (iso: string) =>
  new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * A room's history, read-only: nothing can be added to a room once it has ended, and it cannot be
 * reopened. Customers see the conversation; staff also see Aida's drafts and what was done with
 * them. Anyone with the code can have the history emailed once the room has ended.
 */
export function AidaHistory({ code, staffToken, onBack }: { code: string; staffToken?: string | null; onBack: () => void }) {
  const [room, setRoom] = useState<HistoryRoom | null>(null);
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const isStaff = Boolean(staffToken);
  const staffHeader: Record<string, string> = staffToken ? { "x-aida-staff": staffToken } : {};

  useEffect(() => {
    let cancelled = false;
    fetch("/api/aida/history", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(staffToken ? { "x-aida-staff": staffToken } : {}) },
      body: JSON.stringify({ code }),
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as {
          room?: HistoryRoom;
          events?: HistoryEvent[];
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok || !body.room) {
          setError(body.error ?? "This room could not be found.");
          return;
        }
        setRoom(body.room);
        setEvents(body.events ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the room. Please try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [code, staffToken]);

  if (error) {
    return (
      <section className="mx-auto max-w-md rounded-xl bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-cda-red">{error}</p>
        <button type="button" onClick={onBack} className="mt-4 rounded-lg border border-cda-grey px-4 py-2 text-sm font-semibold">
          Back
        </button>
      </section>
    );
  }
  if (!room) return <p className="text-center text-sm text-cda-text">Loading the conversation…</p>;

  const { lines, suggestions } = historyToState(events, "");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-white p-4 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-cda-dark">{room.title ?? "Aida room"}</h1>
          <p className="text-xs text-cda-text">
            Room code <strong className="tracking-widest text-cda-dark">{room.code}</strong> · started {when(room.createdAt)}
            {room.endedAt ? ` · ended ${when(room.endedAt)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${room.active ? "bg-green-100 text-green-800" : "bg-cda-grey text-cda-dark"}`}
          >
            {room.active ? "Still open" : "Ended · read only"}
          </span>
          <button type="button" onClick={onBack} className="rounded-full bg-cda-dark px-3 py-1.5 text-xs font-semibold text-white">
            Back
          </button>
        </div>
      </header>

      <div className={isStaff ? "grid gap-4 lg:grid-cols-[1fr_340px]" : "grid"}>
        <section className="min-h-[70dvh] space-y-3 rounded-xl bg-cda-grey-light p-4 shadow-sm">
          {lines.length === 0 ? (
            <p className="text-center text-sm text-cda-text">Nothing was said or typed in this room.</p>
          ) : (
            lines.map((line) => <LineView key={line.id} line={line} viewerRole={isStaff ? "employee" : "customer"} />)
          )}
        </section>

        {isStaff && (
          <aside className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-cda-dark">Aida&apos;s drafts</h2>
            {suggestions.length === 0 ? (
              <p className="text-sm text-cda-text">Aida made no drafts in this room.</p>
            ) : (
              suggestions.map((suggestion) => (
                <p key={suggestion.id} className="rounded-lg bg-cda-grey-light p-2 text-xs text-cda-dark">
                  <span
                    className={`font-semibold ${
                      suggestion.status === "approved"
                        ? "text-green-700"
                        : suggestion.status === "declined"
                          ? "text-cda-red"
                          : "text-cda-text"
                    }`}
                  >
                    {suggestion.status === "approved" ? "Sent" : suggestion.status === "declined" ? "Declined" : "Not used"}
                    {suggestion.decidedBy ? ` by ${suggestion.decidedBy}` : ""}
                  </span>
                  : {suggestion.text}
                </p>
              ))
            )}
          </aside>
        )}
      </div>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        {room.active ? (
          <p className="text-sm text-cda-text">The conversation can be emailed once the room has ended.</p>
        ) : (
          <EmailTranscriptForm
            label="Email me this conversation"
            note={isStaff ? "Staff copies also list Aida's drafts." : undefined}
            useAccountEmail={!isStaff}
            onSend={(email) => postEmail("/api/aida/email", { code: room.code, email }, staffHeader)}
          />
        )}
      </section>
    </div>
  );
}
