import { secretMatches } from "@/lib/agentAuth";
import { checkAiEmployees } from "@/lib/aiEmployees";

// About once an hour, from the app's own scheduler (src/lib/dailyJobs.ts), with `Authorization: Bearer <CRON_SECRET>`:
// asks NDI's AI Employees API whether the list changed and, when it did, asks ElevenLabs to re-read /ai-employees and
// /demos, so Clara and Aida know the change within the hour. The reply says when to ask again. Can also be called by hand.
export async function GET(request: Request) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (!(await secretMatches(bearer, process.env.CRON_SECRET))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await checkAiEmployees());
  } catch (error) {
    console.error("AI Employees check failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "failed" }, { status: 502 });
  }
}
