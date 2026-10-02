import { customersOverview } from "@/lib/adminData";
import { isStaffRequest } from "@/lib/aidaStaff";
import { supabaseConfigured } from "@/lib/supabase";

// The admin page's customer list and the numbers above it. Staff only (Aida staff token).
export async function GET(request: Request) {
  if (!(await isStaffRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseConfigured()) return Response.json({ error: "The customer store is not configured" }, { status: 503 });
  try {
    return Response.json(await customersOverview());
  } catch (error) {
    console.error("admin customers failed", error);
    return Response.json({ error: "Could not load the customers" }, { status: 502 });
  }
}
