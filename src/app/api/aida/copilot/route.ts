import { findRoomByLivekitName } from "@/lib/aida";
import { elevenLabsGet } from "@/lib/elevenlabs";
import { ticketFromRequest } from "@/lib/livekit";

// Opens a text-only session with Aida, the copilot agent, for the employee who hosts the room.
// An employee ticket is enough: our server only ever issues one after the Aida staff password.
export async function POST(request: Request) {
  const ticket = await ticketFromRequest(request);
  if (!ticket || ticket.role !== "employee") return Response.json({ error: "Unauthorized" }, { status: 401 });

  const agentId = process.env.AIDA_AGENT_ID;
  if (!agentId) return Response.json({ error: "Aida is not configured" }, { status: 503 });

  const room = await findRoomByLivekitName(ticket.roomName);
  if (!room || room.status !== "open") return Response.json({ error: "The room has ended" }, { status: 410 });

  try {
    const { signed_url } = await elevenLabsGet<{ signed_url: string }>("/conversation/get-signed-url", {
      agent_id: agentId,
    });
    return Response.json({ signedUrl: signed_url });
  } catch (error) {
    console.error("Could not start Aida", error);
    return Response.json({ error: "Aida is unavailable right now" }, { status: 502 });
  }
}
