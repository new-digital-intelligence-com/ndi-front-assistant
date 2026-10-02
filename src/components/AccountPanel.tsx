"use client";

import { useCallback, useEffect, useState } from "react";
import PhoneInput from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import "react-phone-number-input/style.css";

type LinkedChannel = { channel: string; channel_key: string; verified: boolean };

const CHANNEL_LABELS: Record<string, string> = {
  telegram: "Telegram",
  instagram: "Instagram",
  messenger: "Messenger",
  alexa: "Alexa",
  email: "Email",
  phone: "Phone",
  website: "This website",
  slack: "Slack",
};

/** An email address is shown in full; a chat id is not worth reading. */
function describe(channel: LinkedChannel) {
  if (channel.channel === "email" || channel.channel === "phone") return channel.channel_key;
  if (channel.channel === "telegram") return `Chat ${channel.channel_key}`;
  return channel.channel_key.slice(0, 14);
}

export function AccountPanel() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [channels, setChannels] = useState<LinkedChannel[]>([]);
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [addingPhone, setAddingPhone] = useState(false);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/account");
    if (!response.ok) return { signedIn: false, channels: [] as LinkedChannel[] };
    const body = (await response.json()) as { signedIn?: boolean; channels?: LinkedChannel[] };
    return { signedIn: Boolean(body.signedIn), channels: body.channels ?? [] };
  }, []);

  const refresh = useCallback(async () => {
    const state = await load();
    setSignedIn(state.signedIn);
    setChannels(state.channels);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    load().then((state) => {
      if (cancelled) return;
      setSignedIn(state.signedIn);
      setChannels(state.channels);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function submit(action: "signup" | "signin") {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, email, password, name }),
    });
    const body = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? "Something went wrong");
      return;
    }
    setPassword("");
    await refresh();
  }

  async function act(body: object, method: "POST" | "DELETE" = "POST") {
    setBusy(true);
    await fetch("/api/account", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
  }

  if (signedIn === null) {
    return (
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-cda-dark">Your CDA account</h2>
        <p className="mt-2 text-sm text-cda-text">Loading…</p>
      </section>
    );
  }

  if (!signedIn) {
    return (
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-cda-dark">Your CDA account</h2>
        <p className="mt-1 text-sm text-cda-text">
          Link Telegram, Instagram, your phone number and your email addresses, so Ellie knows you on all of
          them and remembers what you asked before.
        </p>

        {/* Collapsed by default: the form is long, and most visitors only want to chat. */}
        <details className="mt-3">
          <summary className="cursor-pointer list-none rounded-lg bg-cda-red px-3 py-2 text-center text-sm font-semibold text-white">
            Create account or sign in
          </summary>

          <div className="mt-3 flex gap-1 rounded-lg bg-cda-grey-light p-1 text-sm">
            {(["signup", "signin"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setMode(option);
                  setError(null);
                }}
                className={`flex-1 rounded-md px-3 py-1.5 font-medium ${
                  mode === option ? "bg-white text-cda-dark shadow-sm" : "text-cda-text"
                }`}
              >
                {option === "signup" ? "Create account" : "Sign in"}
              </button>
            ))}
          </div>

          <form
            className="mt-3 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(mode);
            }}
          >
            {mode === "signup" && (
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                autoComplete="name"
                className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
              />
            )}
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              required
              placeholder="Email address"
              autoComplete="email"
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              required
              minLength={8}
              placeholder="Password (8 characters or more)"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
            {error && <p className="text-sm text-cda-red">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-cda-red px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>
        </details>
      </section>
    );
  }

  return (
    <section className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-semibold text-cda-dark">Your channels</h2>
        <button
          type="button"
          onClick={async () => {
            await act({ action: "signout" });
            setCode(null);
            await refresh();
          }}
          className="text-xs text-cda-text underline"
        >
          Sign out
        </button>
      </div>
      <p className="mt-1 text-sm text-cda-text">Ellie recognises you on each of these.</p>

      <ul className="mt-3 space-y-2">
        {channels.map((channel) => (
          <li
            key={`${channel.channel}:${channel.channel_key}`}
            className="flex items-center justify-between gap-2 rounded-lg bg-cda-grey-light px-3 py-2 text-sm"
          >
            <span className="min-w-0">
              <span className="font-medium text-cda-dark">{CHANNEL_LABELS[channel.channel] ?? channel.channel}</span>
              <span className="block truncate text-xs text-cda-text">{describe(channel)}</span>
            </span>
            <button
              type="button"
              onClick={async () => {
                await act({ channel: channel.channel, channel_key: channel.channel_key }, "DELETE");
                await refresh();
              }}
              className="shrink-0 text-xs text-cda-text underline"
            >
              Remove
            </button>
          </li>
        ))}
        {channels.length === 0 && <li className="text-sm text-cda-text">No channels linked yet.</li>}
      </ul>

      <div className="mt-4 rounded-lg border border-dashed border-black/15 p-3">
        {code ? (
          <>
            <p className="text-sm text-cda-text">Send this code to Ellie from the channel you want to add:</p>
            <p className="mt-2 text-center text-2xl font-bold tracking-widest text-cda-dark">{code}</p>
            <p className="mt-2 text-xs text-cda-text">
              It works once and expires in 30 minutes. Message the Telegram bot, or reply from the email address
              you want to add, with just the code.
            </p>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const response = await fetch("/api/account", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "code" }),
              });
              const body = (await response.json()) as { code?: string };
              setBusy(false);
              if (body.code) setCode(body.code);
            }}
            className="w-full rounded-lg border border-cda-red px-3 py-2 text-sm font-semibold text-cda-red disabled:opacity-60"
          >
            + Add a channel
          </button>
        )}
      </div>

      {/* A phone number cannot send a code, so it is typed in here instead. */}
      <div className="mt-2">
        {addingPhone ? (
          <form
            className="space-y-2 rounded-lg border border-dashed border-black/15 p-3"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError(null);
              const response = await fetch("/api/account", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "phone", phone }),
              });
              const body = (await response.json().catch(() => ({}))) as { error?: string };
              setBusy(false);
              if (!response.ok) {
                setError(body.error ?? "Could not add the number");
                return;
              }
              setPhone("");
              setAddingPhone(false);
              await refresh();
            }}
          >
            <p className="text-sm text-cda-text">Ellie will know you when you call CDA, and when CDA calls you.</p>
            <PhoneInput
              value={phone || undefined}
              onChange={(value) => setPhone(value ?? "")}
              defaultCountry="GB"
              international
              countryCallingCodeEditable={false}
              flags={flags}
              placeholder="Your phone number"
              className="rounded-lg border border-black/10 px-3 py-2 text-sm"
              numberInputProps={{ className: "min-w-0 flex-1 bg-transparent outline-none" }}
            />
            {error && <p className="text-sm text-cda-red">{error}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy || !phone}
                className="flex-1 rounded-lg bg-cda-red px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Save number
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingPhone(false);
                  setError(null);
                }}
                className="rounded-lg border border-black/10 px-3 py-2 text-sm text-cda-text"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAddingPhone(true)}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm font-semibold text-cda-dark"
          >
            + Add your phone number
          </button>
        )}
      </div>
    </section>
  );
}
