import { displayCode, findRoomByCode, isRoomActive, listEvents, normaliseCode } from "@/lib/aida";
import { isStaffRequest } from "@/lib/aidaStaff";

// A room's history, readable after it has ended. The room code is the key, as it was for joining;
// staff (with their staff token) also get Aida's drafts and what was decided about them.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const room = await findRoomByCode(normaliseCode(body.code));
  if (!room) return Response.json({ error: "That room code does not exist." }, { status: 404 });

  const role = (await isStaffRequest(request)) ? "employee" : "customer";
  const events = (await listEvents(room.id, role)).filter((event) => event.kind !== "emailed");

  return Response.json({
    room: {
      code: displayCode(room.code),
      title: room.title,
      active: isRoomActive(room),
      createdAt: room.created_at,
      endedAt: room.closed_at ?? (isRoomActive(room) ? null : room.expires_at),
    },
    role,
    events,
  });
}
