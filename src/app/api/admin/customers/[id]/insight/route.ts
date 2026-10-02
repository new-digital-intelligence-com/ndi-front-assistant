import { customerDetail, customerInsight } from "@/lib/adminData";
import { isStaffRequest } from "@/lib/aidaStaff";
import { anthropicConfigured } from "@/lib/anthropic";

// Claude's short read of one customer, made when a staff member asks for it. Nothing is stored.
export async function POST(request: Request, ctx: RouteContext<"/api/admin/customers/[id]/insight">) {
  if (!(await isStaffRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!anthropicConfigured()) return Response.json({ error: "ANTHROPIC_API_KEY is not set on the server" }, { status: 503 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Unknown customer" }, { status: 404 });
  try {
    const detail = await customerDetail(id);
    if (!detail) return Response.json({ error: "Unknown customer" }, { status: 404 });
    return Response.json({ insight: await customerInsight(detail), at: new Date().toISOString() });
  } catch (error) {
    console.error("customer insight failed", error);
    return Response.json({ error: "Could not write the insight. Please try again." }, { status: 502 });
  }
}
