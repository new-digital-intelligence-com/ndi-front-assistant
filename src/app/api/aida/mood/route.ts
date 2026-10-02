import { cleanText, findRoomByLivekitName } from "@/lib/aida";
import { ticketFromRequest } from "@/lib/livekit";
import { aidaMoods, rateMessage, recordAidaMood } from "@/lib/mood";

// The mood of one thing the customer said or typed in an Aida room, rated by Claude for the staff
// member hosting Aida: a coloured dot on the line, the mood meter, and a hint to Aida when the
// customer is frustrated. Employee ticket only; customers never see a mood.
//   GET  → every line rated so far in this room (for staff who join late)
//   POST { lineId, text } → rates one customer line

export async function GET(request: Request) {
  const ticket = await ticketFromRequest(request);
  if (!ticket || ticket.role !== "employee") return Response.json({ error: "Unauthorized" }, { status: 401 });
  const room = await findRoomByLivekitName(ticket.roomName);
  if (!room) return Response.json({ moods: {} });
  return Response.json({ moods: await aidaMoods(room.id) });
}

export async function POST(request: Request) {
  const ticket = await ticketFromRequest(request);
  if (!ticket || ticket.role !== "employee") return Response.json({ error: "Unauthorized" }, { status: 401 });

  const room = await findRoomByLivekitName(ticket.roomName);
  if (!room || room.status !== "open") return Response.json({ error: "The room has ended" }, { status: 410 });

  const body = (await request.json().catch(() => ({}))) as { lineId?: unknown; text?: unknown };
  const lineId = cleanText(body.lineId, 64);
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 1000) : "";
  if (!lineId || !text) return Response.json({ error: "Nothing to rate" }, { status: 400 });

  // Quick: the host's next draft waits for this, so a slow answer is simply no answer.
  const mood = await rateMessage(text, { timeoutMs: 6_000 });
  if (!mood) return Response.json({ error: "No rating" }, { status: 503 });
  await recordAidaMood(room.id, lineId, text, mood);
  return Response.json({ label: mood.label, score: mood.score, frustration: mood.frustration });
}
