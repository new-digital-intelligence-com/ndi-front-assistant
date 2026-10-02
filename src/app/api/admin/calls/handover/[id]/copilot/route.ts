import { isStaffRequest } from "@/lib/aidaStaff";
import { elevenLabsGet } from "@/lib/elevenlabs";
import { handoverActive, handoverItem } from "@/lib/handover";

// Opens a text-only session with Aida for the staff member following a hand-over on /admin, so she can
// suggest what the colleague could say next. Only while the hand-over is under way. Staff only.
export async function POST(request: Request, ctx: RouteContext<"/api/admin/calls/handover/[id]/copilot">) {
  if (!(await isStaffRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Unknown call" }, { status: 404 });

  const agentId = process.env.AIDA_AGENT_ID;
  if (!agentId) return Response.json({ error: "Aida is not configured" }, { status: 503 });

  const item = await handoverItem(id).catch(() => null);
  if (!item || !handoverActive(item)) return Response.json({ error: "The call has ended" }, { status: 410 });

  try {
    const { signed_url } = await elevenLabsGet<{ signed_url: string }>("/conversation/get-signed-url", { agent_id: agentId });
    return Response.json({ signedUrl: signed_url });
  } catch (error) {
    console.error("Could not start Aida for a hand-over", error);
    return Response.json({ error: "Aida is unavailable right now" }, { status: 502 });
  }
}
