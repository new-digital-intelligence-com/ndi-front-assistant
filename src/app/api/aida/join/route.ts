import {
  cleanText,
  displayCode,
  findRoomByCode,
  isRoomActive,
  livekitRoomName,
  normaliseCode,
  setRoomCustomer,
} from "@/lib/aida";
import { whoIsAsking } from "@/lib/aidaAccess";
import { livekitConfigured, roomTicket } from "@/lib/livekit";
import { supabaseConfigured } from "@/lib/supabase";

// Join a room with its code. Open to everyone; an Aida staff token, when sent, is what makes the
// person an employee. A room that has ended cannot be joined, only read: the answer then says so,
// and the page shows its history instead.
export async function POST(request: Request) {
  if (!livekitConfigured() || !supabaseConfigured()) {
    return Response.json({ error: "Rooms are not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { role, account } = await whoIsAsking(request);
  const name = cleanText(body.name, 40) || cleanText(account?.name, 40);
  if (!name) return Response.json({ error: "Please enter your name" }, { status: 400 });

  const room = await findRoomByCode(normaliseCode(body.code));
  if (!room) return Response.json({ error: "That room code does not exist." }, { status: 404 });
  if (!isRoomActive(room)) {
    return Response.json(
      { error: "This room has ended.", closed: true, room: { code: displayCode(room.code), title: room.title } },
      { status: 410 },
    );
  }

  if (role === "customer" && account) await setRoomCustomer(room.id, account.id);
  const ticket = await roomTicket(livekitRoomName(room), name, role);
  return Response.json({ room: { code: displayCode(room.code), title: room.title }, ticket });
}
