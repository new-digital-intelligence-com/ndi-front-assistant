import { secretMatches } from "@/lib/agentAuth";
import { emailChannelConfigured, processInbox, startInboxWatch } from "@/lib/emailInbox";

// Gmail stops posting to Pub/Sub 7 days after a watch starts. The daily jobs renew it (the app's
// own scheduler, src/lib/dailyJobs.ts, calls /api/cron/daily); this route does the same by hand,
// with `Authorization: Bearer <CRON_SECRET>` or GMAIL_PUSH_SECRET, for example to start the watch
// the first time. It then catches up on anything a missed notification left behind.
export async function GET(request: Request) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  const allowed =
    (await secretMatches(bearer, process.env.CRON_SECRET)) || (await secretMatches(bearer, process.env.GMAIL_PUSH_SECRET));
  if (!allowed) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!emailChannelConfigured()) return Response.json({ error: "The email channel is not configured" }, { status: 503 });

  try {
    const watch = await startInboxWatch();
    const caughtUp = await processInbox(watch.historyId);
    return Response.json({ ok: true, watchExpiresAt: watch.expiresAt, ...caughtUp });
  } catch (error) {
    console.error("gmail-watch failed", error);
    return Response.json({ error: "Could not start the Gmail watch" }, { status: 502 });
  }
}
