import { isStaffRequest } from "@/lib/aidaStaff";
import { incomingOverview } from "@/lib/incomingCalls";

// Calls to NDI for /admin/calls/incoming: the ones happening now and the last twenty
// (src/lib/incomingCalls.ts). Staff only (Aida staff token).
export async function GET(request: Request) {
  if (!(await isStaffRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await incomingOverview());
  } catch (error) {
    console.error("calls to NDI could not be loaded", error);
    // Most likely supabase/schema.sql has not been run again since incoming calls were added.
    return Response.json({ error: "Could not load the calls to NDI. Has supabase/schema.sql been run again?" }, { status: 502 });
  }
}
