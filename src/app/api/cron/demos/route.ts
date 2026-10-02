import { secretMatches } from "@/lib/agentAuth";
import { checkDemoVideos } from "@/lib/demoVideos";

// Hourly, from the app's own scheduler (src/lib/dailyJobs.ts), with `Authorization: Bearer <CRON_SECRET>`:
// reads NDI's YouTube channel now and, when the demo videos changed, asks ElevenLabs to re-read /demos, so Clara
// knows a new video within about an hour. Can also be called by hand.
export async function GET(request: Request) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (!(await secretMatches(bearer, process.env.CRON_SECRET))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await checkDemoVideos());
  } catch (error) {
    console.error("demo videos check failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "failed" }, { status: 502 });
  }
}
