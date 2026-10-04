import { isStaffRequest } from "@/lib/aidaStaff";
import { claraTranscript } from "@/lib/liveCall";

// Clara's part of a call in full, from ElevenLabs, for the call's view on /admin (src/lib/liveCall.ts):
// { state: "done" | "pending" | "none", lines }. Asked for once her part is over. ?kind=incoming for a call to
// NDI; a call-list call otherwise. Staff only (Aida staff token).
export async function GET(request: Request, ctx: RouteContext<"/api/admin/calls/live/[id]/clara">) {
  if (!(await isStaffRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Unknown call" }, { status: 404 });
  const kind = new URL(request.url).searchParams.get("kind") === "incoming" ? "incoming" : "list";
  try {
    return Response.json(await claraTranscript({ kind, id }));
  } catch (error) {
    console.error("Clara's transcript could not be loaded", error);
    return Response.json({ error: "Could not load Clara's transcript" }, { status: 502 });
  }
}
