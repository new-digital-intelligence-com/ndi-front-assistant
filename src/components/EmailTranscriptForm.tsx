"use client";

import { useEffect, useState } from "react";

/**
 * "Email me this conversation": used under the website chat, voice and avatar, and on a finished
 * Aida room. A customer signed in to their CDA account gets it with one click at the address they
 * signed up with (shown, with a way to pick another); anyone else types an address. The caller
 * decides what is sent; this only chooses the address and reports back.
 */
export function EmailTranscriptForm({
  onSend,
  label = "Email me this conversation",
  note,
  useAccountEmail = true,
}: {
  onSend: (email: string) => Promise<void>;
  label?: string;
  note?: string;
  /** Off for CDA staff: their sign-in has no email, and the browser may hold a customer's account. */
  useAccountEmail?: boolean;
}) {
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!useAccountEmail) return;
    let cancelled = false;
    fetch("/api/aida/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((me: { signedIn?: boolean; email?: string | null } | null) => {
        if (!cancelled && me?.signedIn && me.email) setAccountEmail(me.email);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [useAccountEmail]);

  async function sendTo(address: string) {
    setEmail(address);
    setState("sending");
    setMessage(null);
    try {
      await onSend(address);
      setState("sent");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "The email could not be sent.");
    }
  }

  if (state === "sent") {
    return <p className="text-sm text-green-700">✓ Sent to {email}. It can take a minute to arrive.</p>;
  }

  if (!open) {
    if (accountEmail) {
      return (
        <div className="space-y-1">
          {note && <p className="text-xs text-cda-text">{note}</p>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              type="button"
              disabled={state === "sending"}
              onClick={() => void sendTo(accountEmail)}
              className="text-sm font-semibold text-cda-red underline disabled:opacity-60"
            >
              {state === "sending" ? "Sending…" : `✉ ${label}`}
            </button>
            <span className="text-xs text-cda-text">
              to {accountEmail} ·{" "}
              <button type="button" onClick={() => setOpen(true)} className="underline">
                another address
              </button>
            </span>
          </div>
          {message && <p className="text-sm text-cda-red">{message}</p>}
        </div>
      );
    }
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-cda-red underline">
        ✉ {label}
      </button>
    );
  }

  return (
    <form
      className="w-full space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        void sendTo(email.trim());
      }}
    >
      {note && <p className="text-xs text-cda-text">{note}</p>}
      <div className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="your@email.com"
          autoComplete="email"
          autoFocus
          className="min-w-0 flex-1 rounded-full border border-cda-grey px-4 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={state === "sending" || !email.trim()}
          className="rounded-full bg-cda-red px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {state === "sending" ? "Sending…" : "Send"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-cda-text underline">
          Cancel
        </button>
      </div>
      {message && <p className="text-sm text-cda-red">{message}</p>}
    </form>
  );
}

/** Posts to one of our email routes and turns a failure into a readable error. */
export async function postEmail(path: string, body: Record<string, string>, headers: Record<string, string> = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(result.error ?? "The email could not be sent.");
}
