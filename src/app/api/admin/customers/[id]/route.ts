import { customerDetail } from "@/lib/adminData";
import { isStaffRequest } from "@/lib/aidaStaff";

// One customer for the admin page: channels, notes, conversations, emails and Aida calls.
export async function GET(request: Request, ctx: RouteContext<"/api/admin/customers/[id]">) {
  if (!(await isStaffRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Unknown customer" }, { status: 404 });
  try {
    const detail = await customerDetail(id);
    return detail ? Response.json(detail) : Response.json({ error: "Unknown customer" }, { status: 404 });
  } catch (error) {
    console.error("admin customer detail failed", error);
    return Response.json({ error: "Could not load the customer" }, { status: 502 });
  }
}
