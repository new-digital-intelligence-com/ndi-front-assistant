import { addEvent, cleanText, EMPLOYEE_ONLY_KINDS, EVENT_KINDS, findRoomByLivekitName, listEvents, type EventKind } from "@/lib/aida";
import { aidaDraftDeclined, aidaDraftSent } from "@/lib/feedback";
import { ticketFromRequest } from "@/lib/livekit";

// The record of a room. Each person saves only what they themselves said or decided, so nothing is
// stored twice, and the author is always taken from their signed ticket, never from the request.

async function roomFor(request: Request) {
  const ticket = await ticketFromRequest(request);
  if (!ticket) return null;
  const room = await findRoomByLivekitName(ticket.roomName);
  return room ? { ticket, room } : null;
}

/** History for someone joining late. Customers never receive Aida's drafts. */
export async function GET(request: Request) {
  const found = await roomFor(request);
  if (!found) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ events: await listEvents(found.room.id, found.ticket.role) });
}

export async function POST(request: Request) {
  const found = await roomFor(request);
  if (!found) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (found.room.status !== "open") return Response.json({ error: "The room has ended" }, { status: 410 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = body.kind as EventKind;
  if (!EVENT_KINDS.includes(kind)) return Response.json({ error: "Unknown event" }, { status: 400 });
  if (EMPLOYEE_ONLY_KINDS.includes(kind) && found.ticket.role !== "employee") {
    return Response.json({ error: "Not allowed" }, { status: 403 });
  }

  const text = typeof body.text === "string" ? body.text.trim().slice(0, 2000) : "";
  const ref = cleanText(body.ref, 64) || null;
  if (!text && kind !== "declined") return Response.json({ error: "Nothing to save" }, { status: 400 });

  await addEvent(found.room.id, found.ticket, { kind, text: text || null, ref });
  // Staff sent one of Aida's drafts: if they changed a fact first, that correction waits on /admin
  // for staff to turn into an approved answer. Never fatal for the room.
  if (kind === "approved" && ref) {
    await aidaDraftSent(found.room.id, ref, text).catch((error) => console.error("Aida correction check failed", error));
  }
  if (kind === "declined" && ref) {
    await aidaDraftDeclined(found.room.id, ref).catch((error) => console.error("Aida decline not counted", error));
  }
  return Response.json({ ok: true });
}
