"use client";

import { AudioLines, ListChecks, PhoneOutgoing, Plus, Square, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import PhoneInput from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import "react-phone-number-input/style.css";
import type { TeamMember } from "./HandoverTeam";
import { LiveCall } from "./LiveCall";
import { COUNTRY_LABELS } from "./phoneLabels";
import { Panel } from "./ui";

// Outgoing calls (/admin/calls): staff enter phone numbers with instructions, press Start, and Clara phones
// them one by one from NDI's phone line. The server moves a list forward each time this page asks (every
// few seconds while a list is running) and when ElevenLabs reports that a call ended.
//
// The call on the line can be opened live (src/lib/liveCall.ts): its sound and transcript, which Twilio
// charges by the minute, run only while that view is open. A call may name a colleague (typed, or picked
// from the hand-over team): Clara then hands the customer over to them when the moment comes
// (src/lib/handover.ts), and the live view adds Aida's suggestions.

type ItemStatus = "waiting" | "calling" | "reached" | "failed" | "stopped";
type HandoverStatus = "ringing" | "live" | "ended" | "missed" | "abandoned" | "failed";

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
  handover_name: string | null;
  handover_phone: string | null;
  handover_when: string | null;
  handover_status: HandoverStatus | null;
  handover_note: string | null;
  /** How many transcript lines the call has: it was open live at some point. */
  lines?: { count: number }[];
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

type Row = {
  key: number;
  phone: string;
  name: string;
  instructions: string;
  handover: boolean;
  colleagueName: string;
  colleaguePhone: string;
  handoverWhen: string;
};

const MAX_ATTEMPTS = 3;
const POLL_MS = 4_000;
/** NDI's Twilio number as shown, once it is bought and imported into ElevenLabs (CHANNEL_SETUP.md). */
const DEMO_LINE = "";

const FIELD =
  "rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-brand/60 focus:ring-4 focus:ring-brand/10";

let nextKey = 1;
const emptyRow = (): Row => ({
  key: nextKey++,
  phone: "",
  name: "",
  instructions: "",
  handover: false,
  colleagueName: "",
  colleaguePhone: "",
  handoverWhen: "",
});

/** The colleague last used for a hand-over, remembered in this browser to save typing. */
const COLLEAGUE_KEY = "ndi-handover-colleague";

function rememberedColleague(): { name: string; phone: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(COLLEAGUE_KEY) ?? "{}") as { name?: unknown; phone?: unknown };
    return { name: typeof saved.name === "string" ? saved.name : "", phone: typeof saved.phone === "string" ? saved.phone : "" };
  } catch {
    return { name: "", phone: "" };
  }
}

function rememberColleague(name: string, phone: string) {
  try {
    localStorage.setItem(COLLEAGUE_KEY, JSON.stringify({ name, phone }));
  } catch {
    // A private window keeps nothing; the fields are simply empty next time.
  }
}

const handingOver = (item: CallItem) => item.handover_status === "ringing" || item.handover_status === "live";
const transcribed = (item: CallItem) => (item.lines?.[0]?.count ?? 0) > 0;
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const when = (iso: string) =>
  new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function isActive(list: CallList) {
  return list.status === "running" || Boolean(list.current_item);
}

export function OutgoingCalls({ staffToken, onSignOut, team }: { staffToken: string; onSignOut: () => void; team: TeamMember[] }) {
  const [rows, setRows] = useState<Row[]>(() => [emptyRow()]);
  const [title, setTitle] = useState("");
  const [lists, setLists] = useState<CallList[]>([]);
  const [loadedAt, setLoadedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The call shown in the live view; `at` opens it afresh when staff open the same call again. */
  const [open, setOpen] = useState<{ id: string; at: number } | null>(null);
  const openCall = (id: string) => setOpen((current) => ({ id, at: (current?.at ?? 0) + 1 }));

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

  function updateRow(key: number, field: Exclude<keyof Row, "key" | "handover">, value: string) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  }

  function toggleHandover(key: number, on: boolean) {
    const saved = on ? rememberedColleague() : null;
    setRows((current) =>
      current.map((row) =>
        row.key === key
          ? {
              ...row,
              handover: on,
              colleagueName: row.colleagueName || saved?.name || "",
              colleaguePhone: row.colleaguePhone || saved?.phone || "",
            }
          : row,
      ),
    );
  }

  function pickColleague(key: number, member: TeamMember) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, colleagueName: member.name, colleaguePhone: member.phone } : row)));
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const done = await request("/api/admin/calls", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim() || null,
          calls: rows.map((row) => ({
            phone: row.phone,
            name: row.name,
            instructions: row.instructions,
            handover: row.handover ? { name: row.colleagueName, phone: row.colleaguePhone, when: row.handoverWhen } : null,
          })),
        }),
      });
      if (done) {
        const colleague = rows.find((row) => row.handover);
        if (colleague) rememberColleague(colleague.colleagueName, colleague.colleaguePhone);
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

  const ready = rows.every((row) => row.phone.trim() && row.instructions.trim() && (!row.handover || row.colleaguePhone.trim()));

  return (
    <div className="space-y-4">
      {error && (
        <p className="flex items-start justify-between gap-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-brand-dark">
          {error}
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="rounded p-0.5 hover:bg-red-100">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </p>
      )}

      {open && (
        <LiveCall
          key={`${open.id}:${open.at}`}
          staffToken={staffToken}
          kind="list"
          callId={open.id}
          onSignOut={onSignOut}
          onClose={() => setOpen(null)}
        />
      )}

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="New call list" icon={PhoneOutgoing}>
          <p className="-mt-1 mb-3 text-sm text-muted">
            Clara calls from {DEMO_LINE || "NDI's phone line"}, one number at a time. If nobody answers she tries again a minute later, up to{" "}
            {MAX_ATTEMPTS} times, then moves on. Keep this page open while the list runs.
          </p>
          <div className="space-y-3">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="List name (optional), e.g. Demo follow-ups"
              maxLength={80}
              aria-label="List name"
              className={`w-full ${FIELD}`}
            />

            {rows.map((row, index) => (
              <div key={row.key} className="space-y-2 rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-6 text-sm font-semibold text-muted">{index + 1}.</span>
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
                    className={`min-w-0 flex-1 ${FIELD}`}
                    numberInputProps={{ className: "min-w-0 flex-1 bg-transparent outline-none" }}
                  />
                  <input
                    value={row.name}
                    onChange={(event) => updateRow(row.key, "name", event.target.value)}
                    placeholder="Name (optional)"
                    maxLength={80}
                    className={`min-w-0 flex-1 ${FIELD}`}
                  />
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
                      aria-label={`Remove number ${index + 1}`}
                      className="rounded-lg p-1.5 text-muted transition hover:bg-surface hover:text-heading"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
                <textarea
                  value={row.instructions}
                  onChange={(event) => updateRow(row.key, "instructions", event.target.value)}
                  placeholder="What Clara should do on this call, e.g. They asked for a demo of the AI SDR on our website. Ask what they want to automate and offer a call with the NDI team."
                  maxLength={1000}
                  rows={2}
                  className={`w-full ${FIELD}`}
                />
                <label className="flex items-center gap-2 text-sm text-heading">
                  <input type="checkbox" checked={row.handover} onChange={(event) => toggleHandover(row.key, event.target.checked)} />
                  Hand the call over to a colleague when needed
                </label>
                {row.handover && (
                  <div className="space-y-2 rounded-xl bg-surface p-3">
                    {team.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold text-muted">From the team:</span>
                        {team.map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            aria-pressed={row.colleaguePhone === member.phone}
                            onClick={() => pickColleague(row.key, member)}
                            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                              row.colleaguePhone === member.phone ? "bg-heading text-white" : "bg-white text-heading ring-1 ring-line hover:ring-heading"
                            }`}
                          >
                            {member.name}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={row.colleagueName}
                        onChange={(event) => updateRow(row.key, "colleagueName", event.target.value)}
                        placeholder="Colleague's name, e.g. Michael"
                        maxLength={80}
                        className={`min-w-0 flex-1 ${FIELD}`}
                      />
                      <PhoneInput
                        value={row.colleaguePhone || undefined}
                        onChange={(value) => updateRow(row.key, "colleaguePhone", value ?? "")}
                        defaultCountry="CH"
                        international
                        countryCallingCodeEditable={false}
                        flags={flags}
                        labels={COUNTRY_LABELS}
                        placeholder="Colleague's phone"
                        className={`min-w-0 flex-1 ${FIELD}`}
                        numberInputProps={{ className: "min-w-0 flex-1 bg-transparent outline-none" }}
                      />
                    </div>
                    <input
                      value={row.handoverWhen}
                      onChange={(event) => updateRow(row.key, "handoverWhen", event.target.value)}
                      placeholder="When Clara should hand over (optional), e.g. when they want a demo or ask about prices"
                      maxLength={300}
                      className={`w-full ${FIELD}`}
                    />
                    <p className="text-xs text-muted">
                      Clara tells the customer she is connecting them, then {row.colleagueName.trim() || "your colleague"}&apos;s phone rings
                      from NDI&apos;s number: they hear who is waiting and press any key to take the call. Open the call live on this page to
                      follow the conversation with Aida&apos;s suggestions. Without an answer, the customer hears that NDI will call back.
                    </p>
                  </div>
                )}
              </div>
            ))}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setRows((current) => [...current, emptyRow()])}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-heading transition hover:border-heading"
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Add number
              </button>
              <button
                type="button"
                onClick={() => void start()}
                disabled={busy || !ready}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white shadow-glow transition hover:bg-brand-dark disabled:opacity-50 disabled:shadow-none"
              >
                <PhoneOutgoing className="h-4 w-4" aria-hidden="true" />
                {busy ? "Starting…" : `Start calling (${rows.length})`}
              </button>
            </div>
          </div>
        </Panel>

        <div className="min-w-0 space-y-4">
          {lists.length === 0 && (
            <Panel title="Call lists" icon={ListChecks}>
              <p className="text-sm text-muted">No call list yet. The lists you start appear here; open a call to follow it live.</p>
            </Panel>
          )}
          {lists.map((list) => (
            <Panel
              key={list.id}
              title={list.title ?? "Call list"}
              icon={ListChecks}
              aside={
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      list.status === "running" ? "bg-green-100 text-green-800" : "bg-surface text-heading"
                    }`}
                  >
                    {list.status === "running" ? "Running" : list.status === "stopped" ? "Stopped" : "Finished"}
                  </span>
                  {list.status === "running" && (
                    <button
                      type="button"
                      onClick={() => void stop(list.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-brand/40 px-3 py-1 text-xs font-semibold text-brand transition hover:bg-brand-soft"
                    >
                      <Square className="h-3 w-3" aria-hidden="true" /> Stop
                    </button>
                  )}
                </div>
              }
            >
              <p className="-mt-2 mb-3 text-xs text-muted">Started {when(list.created_at)}</p>
              <ol className="space-y-2">
                {(list.items ?? []).map((item) => (
                  <li key={item.id} className="space-y-2 rounded-xl bg-surface p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-heading">
                        {item.position + 1}. {item.name ? `${item.name} · ` : ""}
                        {item.phone}
                      </span>
                      <StatusBadge item={item} now={loadedAt} />
                    </div>
                    <p className="text-xs text-muted">{item.instructions}</p>
                    {item.handover_phone && (
                      <p className="text-xs text-muted">
                        🤝 Hand-over to {item.handover_name || "a colleague"}
                        {item.handover_when ? ` · ${item.handover_when}` : ""}
                      </p>
                    )}
                    {item.status === "calling" && !handingOver(item) && list.current_item === item.id && (
                      <OpenLive onOpen={() => openCall(item.id)} />
                    )}
                    {item.handover_status && <HandoverBadge item={item} onOpen={() => openCall(item.id)} />}
                    {!item.handover_status && item.status !== "calling" && transcribed(item) && (
                      <button type="button" onClick={() => openCall(item.id)} className="text-xs font-semibold text-brand hover:underline">
                        View conversation
                      </button>
                    )}
                    {item.summary && <p className="rounded-lg bg-white p-2 text-xs text-heading">{item.summary}</p>}
                    {item.handover_note && <p className="rounded-lg bg-white p-2 text-xs text-heading">{item.handover_note}</p>}
                  </li>
                ))}
              </ol>
            </Panel>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ item, now }: { item: CallItem; now: number }) {
  const tries = `try ${item.attempts}/${MAX_ATTEMPTS}`;
  let text: string;
  let style = "bg-white text-heading";

  if (item.status === "calling" && handingOver(item)) {
    text = "Handed over";
    style = "bg-amber-100 text-amber-900";
  } else if (item.status === "calling") {
    text = `Calling… (${tries})`;
    style = "bg-amber-100 text-amber-900";
  } else if (item.status === "reached") {
    text = "Reached ✓";
    style = "bg-green-100 text-green-800";
  } else if (item.status === "failed") {
    text = `Not reached after ${MAX_ATTEMPTS} tries${item.last_outcome ? ` (${item.last_outcome})` : ""}`;
    style = "bg-red-50 text-brand-dark";
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

/** Opens a running call live, at the top of the page: its sound and transcript start now (src/lib/liveCall.ts). */
function OpenLive({ onOpen, label = "Open live call" }: { onOpen: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex items-center gap-1.5 rounded-full bg-heading px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black"
    >
      <AudioLines className="h-3.5 w-3.5" aria-hidden="true" /> {label}
    </button>
  );
}

function HandoverBadge({ item, onOpen }: { item: CallItem; onOpen: () => void }) {
  const status = item.handover_status;
  if (!status) return null;
  const who = item.handover_name || "the colleague";
  const shown: Record<HandoverStatus, { text: string; style: string }> = {
    ringing: { text: `Ringing ${who}…`, style: "bg-amber-100 text-amber-900" },
    live: { text: `Live with ${who}`, style: "bg-red-50 text-brand-dark" },
    ended: { text: `Talked with ${who}`, style: "bg-green-100 text-green-800" },
    missed: { text: `${capitalise(who)} did not take the call`, style: "bg-white text-heading" },
    abandoned: { text: "The customer hung up while waiting", style: "bg-white text-heading" },
    failed: { text: "Could not hand over", style: "bg-red-50 text-brand-dark" },
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${shown[status].style}`}>{shown[status].text}</span>
      {handingOver(item) && <OpenLive onOpen={onOpen} label="Open live call · Aida" />}
      {!handingOver(item) && item.status !== "calling" && (status === "ended" || transcribed(item)) && (
        <button type="button" onClick={onOpen} className="text-xs font-semibold text-brand hover:underline">
          View conversation
        </button>
      )}
    </div>
  );
}
