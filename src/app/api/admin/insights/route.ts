import { weekInsight } from "@/lib/adminData";
import { isStaffRequest } from "@/lib/aidaStaff";
import { anthropicConfigured } from "@/lib/anthropic";

// Claude's summary of what customers asked about in the last 7 days, across every channel.
export async function POST(request: Request) {
  if (!(await isStaffRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!anthropicConfigured()) return Response.json({ error: "ANTHROPIC_API_KEY is not set on the server" }, { status: 503 });
  try {
    return Response.json({ insight: await weekInsight(), at: new Date().toISOString() });
  } catch (error) {
    console.error("week insight failed", error);
    return Response.json({ error: "Could not write the summary. Please try again." }, { status: 502 });
  }
}
