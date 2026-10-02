"use client";

import { useCallback, useEffect, useState } from "react";
import PhoneInput, { getCountryCallingCode, isSupportedCountry, type Labels } from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import en from "react-phone-number-input/locale/en";
import "react-phone-number-input/style.css";

// Staff enter phone numbers with instructions, press Start, and Ellie phones them one by one from
// the CDA demo line. The server moves a list forward each time this panel asks (every few seconds
// while a list is running) and when ElevenLabs reports that a call ended.

type ItemStatus = "waiting" | "calling" | "reached" | "failed" | "stopped";

type CallItem = {
  id: string;
  position: number;
  phone: string;
  name: string | null;
  instructions: string;
  status: ItemStatus;
  attempts: number;
  next_attempt_at: string | null;
  last_outcome: string | null;
  summary: string | null;
};

type CallList = {
  id: string;
  title: string | null;
  created_by: string | null;
  status: "running" | "stopped" | "done";
  current_item: string | null;
  created_at: string;
  items?: CallItem[];
};

type Row = { key: number; phone: string; name: string; instructions: string };

const MAX_ATTEMPTS = 3;
const POLL_MS = 4_000;
const DEMO_LINE = "+44 7576 593472";

/** "Tunisia +216" in the country list, so the dial code is visible while choosing. */
const COUNTRY_LABELS: Labels = Object.fromEntries(
  Object.entries(en).map(([code, name]) => [code, isSupportedCountry(code) ? `${name} +${getCountryCallingCode(code)}` : name]),
);

let nextKey = 1;
const emptyRow = (): Row => ({ key: nextKey++, phone: "", name: "", instructions: "" });

const when = (iso: string) =>
  new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function isActive(list: CallList) {
  return list.status === "running" || Boolean(list.current_item);
}

export function CallListPanel({ staffToken, onSignOut }: { staffToken: string; onSignOut: () => void }) {
  const [rows, setRows] = useState<Row[]>(() => [emptyRow()]);
  const [title, setTitle] = useState("");
  const [lists, setLists] = useState<CallList[]>([]);
  const [loadedAt, setLoadedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const request = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const response = await fetch(path, {
        ...init,
        headers: { "x-aida-staff": staffToken, "Content-Type": "application/json" },
      });
      if (response.status === 401) {
        onSignOut();
        return null;
      }
      const body = (await response.json().catch(() => ({}))) as { lists?: CallList[]; error?: string };
      if (!response.ok || !body.lists) throw new Error(body.error ?? "Something went wrong. Please try again.");
      setLists(body.lists);
      setLoadedAt(Date.now());
      return body;
    },
    [staffToken, onSignOut],
  );

  const load = useCallback(async () => {
    try {
      await request("/api/admin/calls");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the call lists.");
    }
  }, [request]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  // While a list is running, ask every few seconds: that is also what moves it on to the next call.
  const running = lists.some(isActive);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [running, load]);

  function updateRow(key: number, field: keyof Omit<Row, "key">, value: string) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const done = await request("/api/admin/calls", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim() || null,
          calls: rows.map(({ phone, name, instructions }) => ({ phone, name, instructions })),
        }),
      });
      if (done) {
        setRows([emptyRow()]);
        setTitle("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the list.");
    } finally {
      setBusy(false);
    }
  }

  async function stop(id: string) {
    setError(null);
    try {
      await request(`/api/admin/calls/${id}/stop`, { method: "POST" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not stop the list.");
    }
  }

  const ready = rows.every((row) => row.phone.trim() && row.instructions.trim());

  return (
    <div className="space-y-4">
      {error && (
        <p className="flex items-start justify-between gap-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-cda-red-dark">
          {error}
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
            ✕
          </button>
        </p>
      )}

      <section className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
        <div>
          <h2 className="font-semibold text-cda-dark">New call list</h2>
          <p className="text-sm text-cda-text">
            Ellie calls from {DEMO_LINE}, one number at a time. If nobody answers she tries again a minute later, up to{" "}
            {MAX_ATTEMPTS} times, then moves on. Keep this page open while the list runs.
          </p>
        </div>

        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="List name (optional), e.g. Warranty reminders"
          maxLength={80}
          className="w-full rounded-lg border border-cda-grey px-3 py-2 text-sm"
        />

        {rows.map((row, index) => (
          <div key={row.key} className="space-y-2 rounded-lg border border-cda-grey p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-6 text-sm font-semibold text-cda-text">{index + 1}.</span>
              {/* Country picker with flag, name and dial code; the value is always +<code><number>. */}
              <PhoneInput
                value={row.phone || undefined}
                onChange={(value) => updateRow(row.key, "phone", value ?? "")}
                defaultCountry="GB"
                international
                countryCallingCodeEditable={false}
                flags={flags}
                labels={COUNTRY_LABELS}
                placeholder="Phone number"
                className="min-w-0 flex-1 rounded-lg border border-cda-grey px-3 py-2 text-sm"
                numberInputProps={{ className: "min-w-0 flex-1 bg-transparent outline-none" }}
              />
              <input
                value={row.name}
                onChange={(event) => updateRow(row.key, "name", event.target.value)}
                placeholder="Name (optional)"
                maxLength={80}
                className="min-w-0 flex-1 rounded-lg border border-cda-grey px-3 py-2 text-sm"
              />
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
                  className="text-xs text-cda-text underline"
                >
                  Remove
                </button>
              )}
            </div>
            <textarea
              value={row.instructions}
              onChange={(event) => updateRow(row.key, "instructions", event.target.value)}
              placeholder="What Ellie should do on this call, e.g. Their oven warranty is not registered yet. Explain the lifetime parts warranty and offer to help them register."
              maxLength={1000}
              rows={2}
              className="w-full rounded-lg border border-cda-grey px-3 py-2 text-sm"
            />
          </div>
        ))}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setRows((current) => [...current, emptyRow()])}
            className="rounded-full border border-cda-grey px-4 py-2 text-sm font-semibold text-cda-dark"
          >
            + Add number
          </button>
          <button
            type="button"
            onClick={() => void start()}
            disabled={busy || !ready}
            className="rounded-full bg-cda-red px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Starting…" : `Start calling (${rows.length})`}
          </button>
        </div>
      </section>

      {lists.map((list) => (
        <section key={list.id} className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold text-cda-dark">{list.title ?? "Call list"}</h2>
              <p className="text-xs text-cda-text">Started {when(list.created_at)}</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  list.status === "running" ? "bg-green-100 text-green-800" : "bg-cda-grey text-cda-dark"
                }`}
              >
                {list.status === "running" ? "Running" : list.status === "stopped" ? "Stopped" : "Finished"}
              </span>
              {list.status === "running" && (
                <button
                  type="button"
                  onClick={() => void stop(list.id)}
                  className="rounded-full border border-cda-red px-3 py-1 text-xs font-semibold text-cda-red"
                >
                  Stop
                </button>
              )}
            </div>
          </div>

          <ol className="space-y-2">
            {(list.items ?? []).map((item) => (
              <li key={item.id} className="rounded-lg bg-cda-grey-light p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-cda-dark">
                    {item.position + 1}. {item.name ? `${item.name} · ` : ""}
                    {item.phone}
                  </span>
                  <StatusBadge item={item} now={loadedAt} />
                </div>
                <p className="mt-1 text-xs text-cda-text">{item.instructions}</p>
                {item.summary && <p className="mt-2 rounded-md bg-white p-2 text-xs text-cda-dark">{item.summary}</p>}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function StatusBadge({ item, now }: { item: CallItem; now: number }) {
  const tries = `try ${item.attempts}/${MAX_ATTEMPTS}`;
  let text: string;
  let style = "bg-cda-grey text-cda-dark";

  if (item.status === "calling") {
    text = `Calling… (${tries})`;
    style = "bg-amber-100 text-amber-900";
  } else if (item.status === "reached") {
    text = "Reached ✓";
    style = "bg-green-100 text-green-800";
  } else if (item.status === "failed") {
    text = `Not reached after ${MAX_ATTEMPTS} tries${item.last_outcome ? ` (${item.last_outcome})` : ""}`;
    style = "bg-red-50 text-cda-red-dark";
  } else if (item.status === "stopped") {
    text = "Not called (list stopped)";
  } else if (item.attempts > 0) {
    const seconds = item.next_attempt_at ? Math.max(0, Math.round((Date.parse(item.next_attempt_at) - now) / 1000)) : 0;
    text = `${item.last_outcome ?? "No answer"} · ${tries} · next try ${seconds > 0 ? `in ${seconds}s` : "now"}`;
    style = "bg-amber-50 text-amber-900";
  } else {
    text = "Waiting";
  }

  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${style}`}>{text}</span>;
}
