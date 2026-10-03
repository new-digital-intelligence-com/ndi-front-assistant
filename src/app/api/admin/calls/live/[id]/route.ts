import { isStaffRequest } from "@/lib/aidaStaff";
import { liveCallView } from "@/lib/liveCall";

// A phone call for its live view on /admin (src/lib/liveCall.ts): its state, the transcript lines after
// ?after=<line id>, and on the first look what NDI already knows about the customer. ?kind=incoming for a
// call to NDI; a call-list call otherwise. Staff only (Aida staff token).
export async function GET(request: Request, ctx: RouteContext<"/api/admin/calls/live/[id]">) {
  if (!(await isStaffRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Unknown call" }, { status: 404 });
  const params = new URL(request.url).searchParams;
  const after = Math.max(0, Math.floor(Number(params.get("after")) || 0));
  const kind = params.get("kind") === "incoming" ? "incoming" : "list";
  try {
    const view = await liveCallView({ kind, id }, after);
    if (!view) return Response.json({ error: "Unknown call" }, { status: 404 });
    return Response.json(view);
  } catch (error) {
    console.error("live call view failed", error);
    return Response.json({ error: "Could not load the call" }, { status: 502 });
  }
}
