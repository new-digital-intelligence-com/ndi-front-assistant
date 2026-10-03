// The hand-over team: the NDI colleagues who can take over a phone call live (supabase/schema.sql,
// handover_team). Staff keep the list on /admin/calls/team. For a call to NDI, Clara's hand-over rings the
// active ones one after another, in the list's order, until someone presses a key (src/lib/handover.ts).
// A call-list call names its own colleague; the list form offers the team to pick from.

import { normalisePhone } from "./phone";
import { supabaseRest as rest } from "./supabase";

const q = encodeURIComponent;
const FIELDS = "id,name,phone,active,position";

export type TeamMember = { id: string; name: string; phone: string; active: boolean; position: number };

export async function teamMembers(): Promise<TeamMember[]> {
  return rest<TeamMember[]>(`handover_team?select=${FIELDS}&order=position.asc,created_at.asc`);
}

/** The first active colleague not rung yet for this hand-over, in the team's order. */
export async function nextTeamMember(tried: string[]): Promise<TeamMember | null> {
  const members = await teamMembers();
  return members.find((member) => member.active && !tried.includes(member.id)) ?? null;
}

let cached: { at: number; available: boolean } | null = null;
const CACHE_MS = 30_000;

/**
 * Whether anyone could take over a call to NDI right now. Asked as Clara's conversation starts, so it is
 * kept for half a minute; anything that fails counts as nobody.
 */
export async function teamAvailable(): Promise<boolean> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.available;
  const available = await rest<{ id: string }[]>("handover_team?active=is.true&select=id&limit=1")
    .then((rows) => rows.length > 0)
    .catch((error) => {
      console.error("hand-over team could not be read", error);
      return false;
    });
  cached = { at: Date.now(), available };
  return available;
}

function clean(name: unknown, phone: unknown): { name: string; phone: string } {
  const cleanName = typeof name === "string" ? name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  const cleanPhone = normalisePhone(phone);
  if (!cleanName) throw new Error("Please enter the colleague's name.");
  if (!cleanPhone) throw new Error("Please enter the colleague's phone number with its country code, e.g. +41 79 123 45 67.");
  return { name: cleanName, phone: cleanPhone };
}

export async function addTeamMember(input: { name: unknown; phone: unknown }): Promise<void> {
  const member = clean(input.name, input.phone);
  const [last] = await rest<{ position: number }[]>("handover_team?select=position&order=position.desc&limit=1");
  await rest("handover_team", {
    method: "POST",
    prefer: "return=minimal",
    body: JSON.stringify({ ...member, position: (last?.position ?? -1) + 1 }),
  });
  cached = null;
}

export async function updateTeamMember(id: string, input: { name?: unknown; phone?: unknown; active?: unknown }): Promise<void> {
  const update: Record<string, unknown> = {};
  if (input.name !== undefined || input.phone !== undefined) Object.assign(update, clean(input.name, input.phone));
  if (typeof input.active === "boolean") update.active = input.active;
  if (!Object.keys(update).length) return;
  await rest(`handover_team?id=eq.${q(id)}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify(update) });
  cached = null;
}

export async function removeTeamMember(id: string): Promise<void> {
  await rest(`handover_team?id=eq.${q(id)}`, { method: "DELETE", prefer: "return=minimal" });
  cached = null;
}

/** One place up or down the order. The positions are written again from 0, so they never tie. */
export async function moveTeamMember(id: string, direction: "up" | "down"): Promise<void> {
  const members = await teamMembers();
  const index = members.findIndex((member) => member.id === id);
  const swap = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swap < 0 || swap >= members.length) return;
  [members[index], members[swap]] = [members[swap], members[index]];
  await Promise.all(
    members.map((member, position) =>
      member.position === position
        ? null
        : rest(`handover_team?id=eq.${q(member.id)}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ position }) }),
    ),
  );
}
