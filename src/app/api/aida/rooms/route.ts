import {
  cleanText,
  createRoom,
  displayCode,
  listClosedRooms,
  listOpenRooms,
  livekitRoomName,
  setRoomCustomer,
  type AidaRoom,
} from "@/lib/aida";
import { whoIsAsking } from "@/lib/aidaAccess";
import { isStaffRequest } from "@/lib/aidaStaff";
import { livekitConfigured, roomTicket } from "@/lib/livekit";
import { supabaseConfigured } from "@/lib/supabase";

// Aida rooms. This route is outside the site password lock (see src/proxy.ts) because customers
// create rooms too. Who you are is decided here and nowhere else: a valid Aida staff token makes
// you CDA staff, anything else makes you a customer. The name you type is only a label.

const summary = (room: AidaRoom) => ({
  code: displayCode(room.code),
  title: room.title,
  createdByRole: room.created_by_role,
  createdByName: room.created_by_name,
  createdAt: room.created_at,
  closedAt: room.closed_at ?? room.expires_at,
});

/** The staff lobby: every open room, and recently finished ones whose history can still be read. */
export async function GET(request: Request) {
  if (!(await isStaffRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseConfigured()) return Response.json({ error: "Rooms are not configured" }, { status: 503 });

  const [open, closed] = await Promise.all([listOpenRooms(), listClosedRooms()]);
  return Response.json({ rooms: open.map(summary), closed: closed.map(summary) });
}

/** Create a room and get a ticket into it. */
export async function POST(request: Request) {
  if (!livekitConfigured() || !supabaseConfigured()) {
    return Response.json({ error: "Rooms are not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { role, account } = await whoIsAsking(request);
  // A customer signed in to their CDA account is not asked for a name: we already know it.
  const name = cleanText(body.name, 40) || cleanText(account?.name, 40);
  if (!name) return Response.json({ error: "Please enter your name" }, { status: 400 });

  const title = cleanText(body.title, 60) || (role === "customer" ? `Help for ${name}` : null);

  try {
    const room = await createRoom(title, role, name);
    if (account) await setRoomCustomer(room.id, account.id);
    const ticket = await roomTicket(livekitRoomName(room), name, role);
    return Response.json({ room: { code: displayCode(room.code), title: room.title }, ticket });
  } catch (error) {
    console.error("Could not create an Aida room", error);
    return Response.json({ error: "Could not create the room. Please try again." }, { status: 502 });
  }
}
