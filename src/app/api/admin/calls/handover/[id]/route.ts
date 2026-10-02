import { isStaffRequest } from "@/lib/aidaStaff";
import { handoverView } from "@/lib/handover";

// A call's hand-over to a colleague, for /admin while it happens: its state, the transcript lines after
// ?after=<line id>, and on the first look what NDI already knows about the customer. Staff only (Aida
// staff token).
export async function GET(request: Request, ctx: RouteContext<"/api/admin/calls/handover/[id]">) {
  if (!(await isStaffRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Unknown call" }, { status: 404 });
  const after = Math.max(0, Math.floor(Number(new URL(request.url).searchParams.get("after")) || 0));
  try {
    const view = await handoverView(id, after);
    if (!view) return Response.json({ error: "This call has no hand-over" }, { status: 404 });
    return Response.json(view);
  } catch (error) {
    console.error("hand-over view failed", error);
    return Response.json({ error: "Could not load the call" }, { status: 502 });
  }
}
