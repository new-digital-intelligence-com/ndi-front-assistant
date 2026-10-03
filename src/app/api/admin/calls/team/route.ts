import { isStaffRequest } from "@/lib/aidaStaff";
import { addTeamMember, moveTeamMember, removeTeamMember, teamMembers, updateTeamMember } from "@/lib/handoverTeam";
import { twilioConfigured } from "@/lib/twilio";

// The hand-over team for /admin/calls/team (src/lib/handoverTeam.ts). Staff only (Aida staff token).
//   GET  → { members, twilio }  (twilio: whether hand-overs and the live view of calls can work yet)
//   POST → { action: "add", name, phone } | { action: "update", id, name?, phone?, active? }
//          | { action: "remove", id } | { action: "move", id, direction: "up" | "down" }, then the same as GET

const UUID = /^[0-9a-f-]{36}$/i;

async function members() {
  return Response.json({ members: await teamMembers(), twilio: twilioConfigured() });
}

export async function GET(request: Request) {
  if (!(await isStaffRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return await members();
  } catch (error) {
    console.error("hand-over team could not be loaded", error);
    return Response.json({ error: "Could not load the hand-over team. Has supabase/schema.sql been run again?" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  if (!(await isStaffRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === "string" && UUID.test(body.id) ? body.id : null;
  try {
    if (body.action === "add") await addTeamMember({ name: body.name, phone: body.phone });
    else if (body.action === "update" && id) await updateTeamMember(id, { name: body.name, phone: body.phone, active: body.active });
    else if (body.action === "remove" && id) await removeTeamMember(id);
    else if (body.action === "move" && id && (body.direction === "up" || body.direction === "down")) await moveTeamMember(id, body.direction);
    else return Response.json({ error: "Unknown change" }, { status: 400 });
    return await members();
  } catch (error) {
    // Our own messages (a missing name, a wrong number) are meant for staff; anything else is logged.
    if (error instanceof Error && error.message.startsWith("Please")) return Response.json({ error: error.message }, { status: 400 });
    console.error("hand-over team change failed", error);
    return Response.json({ error: "Could not save the change. Please try again." }, { status: 502 });
  }
}
