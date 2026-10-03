"use client";

import { PhoneIncoming, PhoneOutgoing, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { HandoverTeam, type TeamChange, type TeamMember } from "./HandoverTeam";
import { IncomingCalls } from "./IncomingCalls";
import { OutgoingCalls } from "./OutgoingCalls";
import { SectionTabs, useSectionPath } from "./ui";

// The Calls section of the staff console, in three tabs at their own addresses:
// - Outgoing (/admin/calls): call lists Clara phones, each call with its live sound and hand-over.
// - Incoming (/admin/calls/incoming): calls to NDI that Clara answers, the same way.
// - Hand-over team (/admin/calls/team): the colleagues who can take over a call.
// Outgoing and Incoming stay mounted while staff look at another tab, so a live view is not cut off.

const BASE = "/admin/calls";
const INCOMING = `${BASE}/incoming`;
const TEAM = `${BASE}/team`;

export function CallsPanel({ staffToken, onSignOut }: { staffToken: string; onSignOut: () => void }) {
  const path = useSectionPath(BASE);
  const view = path.startsWith(INCOMING) ? "incoming" : path.startsWith(TEAM) ? "team" : "outgoing";
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [twilio, setTwilio] = useState<boolean | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [liveIncoming, setLiveIncoming] = useState<number | undefined>(undefined);

  const teamRequest = useCallback(
    async (init?: RequestInit) => {
      const response = await fetch("/api/admin/calls/team", {
        ...init,
        headers: { "x-aida-staff": staffToken, "Content-Type": "application/json" },
        cache: "no-store",
      });
      if (response.status === 401) {
        onSignOut();
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { members?: TeamMember[]; twilio?: boolean; error?: string };
      if (!response.ok || !body.members) throw new Error(body.error ?? "Could not load the hand-over team.");
      setTeam(body.members);
      setTwilio(Boolean(body.twilio));
      setTeamError(null);
    },
    [staffToken, onSignOut],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      teamRequest().catch((error: unknown) => setTeamError(error instanceof Error ? error.message : "Could not load the hand-over team."));
    }, 0);
    return () => clearTimeout(timer);
  }, [teamRequest]);

  const changeTeam = useCallback(
    async (change: TeamChange) => {
      try {
        await teamRequest({ method: "POST", body: JSON.stringify(change) });
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : "Could not save the change.";
      }
    },
    [teamRequest],
  );

  const activeTeam = team?.filter((member) => member.active) ?? [];

  return (
    <div className="space-y-4">
      <SectionTabs
        label="Calls"
        active={view === "incoming" ? INCOMING : view === "team" ? TEAM : BASE}
        tabs={[
          { href: BASE, label: "Outgoing", icon: PhoneOutgoing },
          { href: INCOMING, label: "Incoming", icon: PhoneIncoming, count: liveIncoming || undefined, highlight: true },
          { href: TEAM, label: "Hand-over team", short: "Team", icon: Users, count: team ? activeTeam.length : undefined },
        ]}
      />

      {twilio === false && view !== "team" && (
        <p className="rounded-xl bg-amber-50 px-4 py-2 text-xs text-amber-900">
          NDI&apos;s Twilio number and keys are not set up yet: calls, hand-overs to a colleague and the live sound start once they are.
        </p>
      )}
      {teamError && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-brand-dark">{teamError}</p>}

      <div className={view === "outgoing" ? "animate-fade-up" : "hidden"}>
        <OutgoingCalls staffToken={staffToken} onSignOut={onSignOut} team={activeTeam} />
      </div>
      <div className={view === "incoming" ? "animate-fade-up" : "hidden"}>
        <IncomingCalls staffToken={staffToken} onSignOut={onSignOut} active={view === "incoming"} onLiveCount={setLiveIncoming} />
      </div>
      {view === "team" && (
        <div className="animate-fade-up">
          <HandoverTeam members={team} twilio={twilio} onChange={changeTeam} />
        </div>
      )}
    </div>
  );
}
