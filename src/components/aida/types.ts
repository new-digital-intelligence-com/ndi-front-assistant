export type AidaRole = "employee" | "customer";

export type RoomTicket = { url: string; token: string; identity: string; name: string; role: AidaRole };

export type JoinedRoom = { room: { code: string; title: string | null }; ticket: RoomTicket };

/** How one customer line sounded, rated by Claude: staff only, never sent to a customer. */
export type LineMood = { label: "positive" | "neutral" | "negative"; score: number; frustration: number };

/** Messages sent between browsers in a room, over LiveKit's data channel. */
export type WireMessage =
  | { type: "speech"; id: string; text: string }
  | { type: "chat"; id: string; text: string }
  | { type: "suggestion"; id: string; text: string; replyTo: string }
  | { type: "approved"; suggestionId: string; text: string }
  | { type: "declined"; suggestionId: string }
  /** The host shares each customer line's mood with the other employees. */
  | { type: "mood"; lineId: string; mood: LineMood };

export type TimelineLine = {
  id: string;
  kind: "speech" | "chat" | "approved" | "system";
  name: string;
  role: AidaRole | "system";
  text: string;
  mine?: boolean;
  /** For an approved reply: which employee sent it. Only employees are shown this. */
  approvedBy?: string;
};

export type Suggestion = {
  id: string;
  text: string;
  replyTo: string;
  status: "pending" | "approved" | "declined";
  decidedBy?: string;
};

export type Person = { identity: string; name: string; role: AidaRole; speaking: boolean; isMe: boolean };

/** Joining a room that has ended: it cannot be joined any more, only its history read. */
export class RoomClosedError extends Error {
  code: string;

  constructor(code: string) {
    super("This room has ended.");
    this.code = code;
  }
}

/**
 * Joining and creating rooms share one response shape. Sending the staff token is what makes the
 * server treat this person as CDA staff; without it they are a customer.
 */
export async function requestRoom(
  path: "/api/aida/rooms" | "/api/aida/join",
  body: Record<string, string>,
  staffToken?: string | null,
): Promise<JoinedRoom> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(staffToken ? { "x-aida-staff": staffToken } : {}) },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as Partial<JoinedRoom> & {
    error?: string;
    closed?: boolean;
  };
  if (result.closed && result.room) throw new RoomClosedError(result.room.code);
  if (!response.ok || !result.ticket || !result.room) {
    throw new Error(result.error ?? "Something went wrong. Please try again.");
  }
  return { room: result.room, ticket: result.ticket };
}

// The staff token lives in sessionStorage, which belongs to one tab: a new tab (for example the
// invite link opened next to the lobby) starts without it and is therefore a customer.
const STAFF_KEY = "aida-staff";

export function savedStaffToken(): string | null {
  try {
    const token = sessionStorage.getItem(STAFF_KEY);
    const expiresAt = Number(token?.split(".")[0]);
    return token && Number.isFinite(expiresAt) && expiresAt > Date.now() ? token : null;
  } catch {
    return null;
  }
}

export function rememberStaffToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(STAFF_KEY, token);
    else sessionStorage.removeItem(STAFF_KEY);
  } catch {
    // Storage unavailable: the tab simply has to sign in again after a reload.
  }
}

const NAME_KEY = "aida-name";

/** Remembering the name is a convenience only; private windows or blocked storage just start empty. */
export function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Storage unavailable: nothing to do.
  }
}
