import {
  closeRoom,
  findOpenRoomByCode,
  findRoomByLivekitName,
  listEvents,
  livekitRoomName,
  normaliseCode,
  roomCustomerId,
  type AidaRoom,
} from "@/lib/aida";
import { isStaffRequest } from "@/lib/aidaStaff";
import { addCustomerNote } from "@/lib/customers";
import { deleteLivekitRoom, ticketFromRequest } from "@/lib/livekit";
import { formatDate } from "@/lib/transcriptEmail";

// Ends a room for everyone: closes it in our records and removes it from LiveKit, which
// disconnects every participant. It can never be reopened; its history stays readable. Staff only,
// in one of two ways:
// - from inside the room, with their employee ticket (only ever issued to staff), or
// - from the lobby, with their staff token and the room's code, without joining it first.
export async function POST(request: Request) {
  const ticket = await ticketFromRequest(request);

  let room: AidaRoom | null = null;
  if (ticket?.role === "employee") {
    room = await findRoomByLivekitName(ticket.roomName);
  } else if (await isStaffRequest(request)) {
    const body = (await request.json().catch(() => ({}))) as { code?: unknown };
    room = await findOpenRoomByCode(normaliseCode(body.code));
  } else {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!room) return Response.json({ error: "Room not found" }, { status: 404 });
  if (room.status === "closed") return Response.json({ ok: true, alreadyClosed: true });

  await closeRoom(room.id);
  await deleteLivekitRoom(livekitRoomName(room));
  await rememberCall(room).catch((error) => console.error("Could not add the call to the customer's memory", error));
  return Response.json({ ok: true });
}

/**
 * If a signed-in customer was in the room, the call becomes part of what we remember about them,
 * so Ellie and Aida can refer to it on any channel next time.
 */
async function rememberCall(room: AidaRoom) {
  const customerId = await roomCustomerId(room.id);
  if (!customerId) return;

  const events = await listEvents(room.id, "employee");
  const firstQuestion = events.find((event) => event.author_role === "customer" && event.text)?.text ?? "";
  const replies = events.filter((event) => event.kind === "approved").length;
  if (!firstQuestion && replies === 0) return;

  const asked = firstQuestion ? `asked "${firstQuestion.slice(0, 160)}"` : "talked with CDA staff";
  await addCustomerNote(
    customerId,
    "aida",
    `Live call with CDA staff on ${formatDate(room.created_at)}: ${asked}${replies ? `; CDA sent ${replies} written repl${replies === 1 ? "y" : "ies"}` : ""}.`,
  );
}
