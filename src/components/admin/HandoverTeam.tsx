"use client";

import { ArrowDown, ArrowUp, Info, Trash2, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import PhoneInput from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import "react-phone-number-input/style.css";
import { COUNTRY_LABELS } from "./phoneLabels";
import { Empty, Panel } from "./ui";

// The hand-over team (/admin/calls/team, src/lib/handoverTeam.ts): the NDI colleagues who can take over a
// phone call live. For a call to NDI they are rung one after another, top first, until someone presses a
// key; a call list can pick one of them for each number.

export type TeamMember = { id: string; name: string; phone: string; active: boolean; position: number };

export type TeamChange =
  | { action: "add"; name: string; phone: string }
  | { action: "update"; id: string; active: boolean }
  | { action: "remove"; id: string }
  | { action: "move"; id: string; direction: "up" | "down" };

const FIELD =
  "rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-brand/60 focus:ring-4 focus:ring-brand/10";

export function HandoverTeam({
  members,
  twilio,
  onChange,
}: {
  members: TeamMember[] | null;
  /** Whether the Twilio keys are set, so hand-overs can actually happen. */
  twilio: boolean | null;
  /** Saves a change; resolves to an error for staff, or null. */
  onChange: (change: TeamChange) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  async function save(label: string, change: TeamChange) {
    setBusy(label);
    setError(null);
    const problem = await onChange(change);
    setBusy(null);
    if (problem) setError(problem);
    return !problem;
  }

  const active = members?.filter((member) => member.active).length ?? 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-brand-dark">{error}</p>}

        <Panel title={`Team (${active} active)`} icon={Users}>
          {members === null ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : members.length === 0 ? (
            <Empty icon={Users} title="Nobody in the team yet" text="Add the colleagues who can take over a call, in the order they should be rung." />
          ) : (
            <ol className="space-y-2">
              {members.map((member, index) => (
                <li
                  key={member.id}
                  className={`flex flex-wrap items-center gap-3 rounded-xl border border-line px-3 py-2.5 ${member.active ? "bg-white" : "bg-surface"}`}
                >
                  <span className="w-5 text-center text-xs font-bold text-muted">{index + 1}</span>
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      member.active ? "bg-brand-soft text-brand" : "bg-line text-muted"
                    }`}
                    aria-hidden="true"
                  >
                    {member.name.trim()[0]?.toUpperCase()}
                  </span>
                  <span className="min-w-[9rem] flex-1 leading-tight">
                    <span className={`block truncate text-sm font-semibold ${member.active ? "text-heading" : "text-muted"}`}>{member.name}</span>
                    <span className="block truncate text-xs text-muted">{member.phone}</span>
                  </span>
                  <span className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={member.active}
                      aria-label={`${member.name} takes calls`}
                      disabled={busy !== null}
                      onClick={() => void save(`active-${member.id}`, { action: "update", id: member.id, active: !member.active })}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60 ${member.active ? "bg-brand" : "bg-line"}`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${member.active ? "left-[22px]" : "left-0.5"}`}
                        aria-hidden="true"
                      />
                    </button>
                    <span className="w-8 text-[11px] font-semibold text-muted">{member.active ? "On" : "Off"}</span>
                    <button
                      type="button"
                      title="Ring earlier"
                      aria-label={`Ring ${member.name} earlier`}
                      disabled={busy !== null || index === 0}
                      onClick={() => void save(`move-${member.id}`, { action: "move", id: member.id, direction: "up" })}
                      className="rounded-lg p-1.5 text-muted transition hover:bg-surface hover:text-heading disabled:opacity-30"
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      title="Ring later"
                      aria-label={`Ring ${member.name} later`}
                      disabled={busy !== null || index === members.length - 1}
                      onClick={() => void save(`move-${member.id}`, { action: "move", id: member.id, direction: "down" })}
                      className="rounded-lg p-1.5 text-muted transition hover:bg-surface hover:text-heading disabled:opacity-30"
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </button>
                    {removing === member.id ? (
                      <span className="flex items-center gap-1 pl-1">
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={async () => {
                            if (await save(`remove-${member.id}`, { action: "remove", id: member.id })) setRemoving(null);
                          }}
                          className="rounded-full bg-brand px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          Remove
                        </button>
                        <button type="button" onClick={() => setRemoving(null)} className="rounded-full px-2 py-1 text-xs font-semibold text-muted">
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        title="Remove from the team"
                        aria-label={`Remove ${member.name} from the team`}
                        disabled={busy !== null}
                        onClick={() => setRemoving(member.id)}
                        className="rounded-lg p-1.5 text-muted transition hover:bg-brand-soft hover:text-brand disabled:opacity-30"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="Add a colleague" icon={UserPlus}>
          <form
            className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center"
            onSubmit={async (event) => {
              event.preventDefault();
              if (await save("add", { action: "add", name, phone })) {
                setName("");
                setPhone("");
              }
            }}
          >
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name, e.g. Michael"
              maxLength={80}
              aria-label="The colleague's name"
              className={`min-w-0 flex-1 ${FIELD}`}
            />
            <PhoneInput
              value={phone || undefined}
              onChange={(value) => setPhone(value ?? "")}
              defaultCountry="CH"
              international
              countryCallingCodeEditable={false}
              flags={flags}
              labels={COUNTRY_LABELS}
              placeholder="Their phone"
              className={`min-w-0 flex-1 ${FIELD}`}
              numberInputProps={{ className: "min-w-0 flex-1 bg-transparent outline-none", "aria-label": "The colleague's phone" }}
            />
            <button
              type="submit"
              disabled={busy !== null || !name.trim() || !phone}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              {busy === "add" ? "Adding…" : "Add"}
            </button>
          </form>
        </Panel>
      </div>

      <Panel title="How a hand-over works" icon={Info} className="h-fit text-sm leading-relaxed text-muted">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Someone <strong className="text-heading">calls NDI</strong> and wants a person: Clara says she is connecting them, and the
            customer waits with hold music.
          </li>
          <li>
            The colleagues who are <strong className="text-heading">On</strong> are rung one after another, top first, for 25 seconds each.
            They hear who is waiting and what Clara learnt, and press any key to take the call.
          </li>
          <li>If nobody takes it, the customer hears that NDI will call back.</li>
          <li>
            While they talk, <strong className="text-heading">Incoming</strong> shows the call&apos;s sound, the conversation and Aida&apos;s
            suggestions.
          </li>
          <li>A call list can pick one of these colleagues for each number it calls.</li>
        </ul>
        {twilio === false && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Hand-overs start once the Twilio keys (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN) are set on the server.
          </p>
        )}
      </Panel>
    </div>
  );
}
