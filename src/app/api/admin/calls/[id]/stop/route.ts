import { isStaffRequest } from "@/lib/aidaStaff";
import { recentLists, stopList } from "@/lib/outboundCalls";

// Stops a call list: no new calls. A call already in progress is not cut off.
export async function POST(request: Request, ctx: RouteContext<"/api/admin/calls/[id]/stop">) {
  if (!(await isStaffRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Unknown list" }, { status: 404 });
  try {
    await stopList(id);
    return Response.json({ lists: await recentLists() });
  } catch (error) {
    console.error("call list could not stop", error);
    return Response.json({ error: "Could not stop the list" }, { status: 502 });
  }
}
