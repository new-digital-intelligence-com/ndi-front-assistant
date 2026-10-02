import { findRoomByLivekitName } from "@/lib/aida";
import { realtimeScribeToken } from "@/lib/elevenlabs";
import { ticketFromRequest } from "@/lib/livekit";

// A one-use Scribe token so each person's browser can transcribe their own microphone. Only people
// holding a ticket to an open room get one, which keeps this from becoming free transcription for
// anyone who finds the URL.
export async function POST(request: Request) {
  const ticket = await ticketFromRequest(request);
  if (!ticket) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const room = await findRoomByLivekitName(ticket.roomName);
  if (!room || room.status !== "open") return Response.json({ error: "The room has ended" }, { status: 410 });

  try {
    return Response.json({ token: await realtimeScribeToken() });
  } catch (error) {
    console.error("Could not create a Scribe token", error);
    return Response.json({ error: "The live transcript is unavailable" }, { status: 502 });
  }
}
