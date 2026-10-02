// Aida rooms: who created them, their join code, and the record of everything said in them.
// Voice and live messages go through LiveKit (src/lib/livekit.ts); this is only the record.

import type { AidaRole } from "./livekit";
import { supabaseRest as rest } from "./supabase";
import type { TranscriptLine } from "./transcriptEmail";

export type AidaRoom = {
  id: string;
  code: string;
  title: string | null;
  created_by_role: AidaRole;
  created_by_name: string | null;
  status: "open" | "closed";
  created_at: string;
  expires_at: string;
  closed_at: string | null;
};

/** A room takes part only while it is open and not past its time; after that it is read-only. */
export const isRoomActive = (room: Pick<AidaRoom, "status" | "expires_at">) =>
  room.status === "open" && new Date(room.expires_at).getTime() > Date.now();

export const EVENT_KINDS = ["speech", "chat", "suggestion", "approved", "declined"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** Only employees may record these: they are Aida's drafts and what was decided about them. */
export const EMPLOYEE_ONLY_KINDS: readonly EventKind[] = ["suggestion", "approved", "declined"];

/**
 * Customers never get these back, not even from the saved history. "emailed" is written only by
 * the server, to count how often a room's history was sent.
 */
const HIDDEN_FROM_CUSTOMERS = ["suggestion", "declined", "emailed"];

/** How many times one room's history may be emailed, so the mailbox cannot be used to spam. */
export const MAX_EMAILS_PER_ROOM = 10;

export type AidaEvent = {
  id: number;
  kind: EventKind | "emailed";
  author_identity: string;
  author_name: string | null;
  author_role: AidaRole;
  text: string | null;
  ref: string | null;
  created_at: string;
};

const ROOM_LIFETIME_HOURS = 4;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0 or 1 to read out loud
const q = encodeURIComponent;

const ROOM_FIELDS = "id,code,title,created_by_role,created_by_name,status,created_at,expires_at,closed_at";

/** The LiveKit room that belongs to one of our rooms. */
export const livekitRoomName = (room: Pick<AidaRoom, "id">) => `aida-${room.id}`;

/** A short single-line string, or "" when there is nothing usable. */
export function cleanText(input: unknown, max: number): string {
  return typeof input === "string" ? input.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Accepts "4f2-k9m", "4F2K9M" or " 4F2 K9M " alike. */
export function normaliseCode(input: unknown): string {
  return typeof input === "string" ? input.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
}

/** Shown to people as 4F2-K9M, which is easier to read out on a call. */
export const displayCode = (code: string) => `${code.slice(0, 3)}-${code.slice(3)}`;

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export async function createRoom(title: string | null, role: AidaRole, name: string): Promise<AidaRoom> {
  const expiresAt = new Date(Date.now() + ROOM_LIFETIME_HOURS * 3_600_000).toISOString();
  // A clash is a one-in-a-billion event; trying again is simpler than locking.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const [room] = await rest<AidaRoom[]>(`aida_rooms?select=${ROOM_FIELDS}`, {
        method: "POST",
        prefer: "return=representation",
        body: JSON.stringify({
          code: newCode(),
          title,
          created_by_role: role,
          created_by_name: name,
          expires_at: expiresAt,
        }),
      });
      return room;
    } catch (error) {
      if (attempt === 2 || !String(error).includes("duplicate")) throw error;
    }
  }
  throw new Error("Could not create a room code");
}

const openFilter = () => `status=eq.open&expires_at=gt.${q(new Date().toISOString())}`;

export async function findOpenRoomByCode(code: string): Promise<AidaRoom | null> {
  if (code.length !== 6) return null;
  const rows = await rest<AidaRoom[]>(`aida_rooms?code=eq.${q(code)}&${openFilter()}&select=${ROOM_FIELDS}&limit=1`);
  return rows[0] ?? null;
}

/** Any room with this code, open or closed: closed rooms stay readable. */
export async function findRoomByCode(code: string): Promise<AidaRoom | null> {
  if (code.length !== 6) return null;
  const rows = await rest<AidaRoom[]>(`aida_rooms?code=eq.${q(code)}&select=${ROOM_FIELDS}&limit=1`);
  return rows[0] ?? null;
}

/** Recently finished rooms for the staff lobby: closed by staff, or past their time. */
export async function listClosedRooms(): Promise<AidaRoom[]> {
  const now = q(new Date().toISOString());
  return rest<AidaRoom[]>(
    `aida_rooms?or=(status.eq.closed,expires_at.lt.${now})&select=${ROOM_FIELDS}&order=created_at.desc&limit=30`,
  );
}

// The customer behind a room, when they joined signed in to their CDA account. This column arrived
// after the table did, so these two never fail: before supabase/schema.sql is run again the room
// simply has no known customer.

export async function roomCustomerId(roomId: string): Promise<string | null> {
  try {
    const rows = await rest<{ customer_id: string | null }[]>(`aida_rooms?id=eq.${q(roomId)}&select=customer_id&limit=1`);
    return rows[0]?.customer_id ?? null;
  } catch {
    return null;
  }
}

/** The first signed-in customer to join becomes the room's customer. */
export async function setRoomCustomer(roomId: string, customerId: string) {
  try {
    await rest(`aida_rooms?id=eq.${q(roomId)}&customer_id=is.null`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ customer_id: customerId }),
    });
  } catch (error) {
    console.warn("Could not record the room's customer (run supabase/schema.sql again?)", error);
  }
}

export async function countEmails(roomId: string): Promise<number> {
  const rows = await rest<{ id: number }[]>(`aida_events?room_id=eq.${q(roomId)}&kind=eq.emailed&select=id`);
  return rows.length;
}

/** Records that the history was emailed, without the address: nobody needs to see who asked. */
export async function markEmailed(roomId: string, author: { identity: string; name: string; role: AidaRole }) {
  await rest("aida_events", {
    method: "POST",
    prefer: "return=minimal",
    body: JSON.stringify({
      room_id: roomId,
      kind: "emailed",
      author_identity: author.identity,
      author_name: author.name,
      author_role: author.role,
    }),
  });
}

export async function findRoomByLivekitName(roomName: string): Promise<AidaRoom | null> {
  const id = roomName.startsWith("aida-") ? roomName.slice(5) : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await rest<AidaRoom[]>(`aida_rooms?id=eq.${q(id)}&select=${ROOM_FIELDS}&limit=1`);
  return rows[0] ?? null;
}

export async function listOpenRooms(): Promise<AidaRoom[]> {
  return rest<AidaRoom[]>(`aida_rooms?${openFilter()}&select=${ROOM_FIELDS}&order=created_at.desc&limit=50`);
}

export async function closeRoom(roomId: string) {
  await rest(`aida_rooms?id=eq.${q(roomId)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ status: "closed", closed_at: new Date().toISOString() }),
  });
}

export async function addEvent(
  roomId: string,
  author: { identity: string; name: string; role: AidaRole },
  event: { kind: EventKind; text: string | null; ref: string | null },
) {
  await rest("aida_events", {
    method: "POST",
    prefer: "return=minimal",
    body: JSON.stringify({
      room_id: roomId,
      kind: event.kind,
      author_identity: author.identity,
      author_name: author.name,
      author_role: author.role,
      text: event.text,
      ref: event.ref,
    }),
  });
}

/** The room's history for someone joining late. Customers never see Aida's drafts. */
export async function listEvents(roomId: string, forRole: AidaRole): Promise<AidaEvent[]> {
  const hidden = forRole === "customer" ? `&kind=not.in.(${HIDDEN_FROM_CUSTOMERS.join(",")})` : "";
  return rest<AidaEvent[]>(
    `aida_events?room_id=eq.${q(roomId)}${hidden}` +
      "&select=id,kind,author_identity,author_name,author_role,text,ref,created_at&order=id.asc&limit=500",
  );
}

/** The conversation as people saw it: what was said and typed, and the replies CDA sent. */
export function roomTranscript(events: AidaEvent[]): TranscriptLine[] {
  return events.flatMap((event): TranscriptLine[] => {
    const text = event.text ?? "";
    if (event.kind === "speech" || event.kind === "chat") {
      const who = event.author_role === "employee" ? "CDA" : "customer";
      return [{ speaker: `${event.author_name || "Someone"} (${who})`, text }];
    }
    // An approved draft goes out in the staff member's name, exactly as it looked in the room.
    if (event.kind === "approved") return [{ speaker: `${event.author_name || "CDA Support"} (CDA)`, text, highlight: true }];
    return [];
  });
}

/** For staff only: every draft Aida wrote and what was done with it. */
export function draftOutcomes(events: AidaEvent[]): string[] {
  const outcome = new Map<string, string>();
  for (const event of events) {
    if (!event.ref) continue;
    if (event.kind === "approved") outcome.set(event.ref, `sent by ${event.author_name || "staff"}`);
    if (event.kind === "declined") outcome.set(event.ref, `declined by ${event.author_name || "staff"}`);
  }
  return events
    .filter((event) => event.kind === "suggestion" && event.ref)
    .map((event) => `${outcome.get(event.ref!) ?? "not used"}: ${event.text ?? ""}`);
}
