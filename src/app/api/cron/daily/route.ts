import { secretMatches } from "@/lib/agentAuth";
import { emailChannelConfigured, processInbox, startInboxWatch } from "@/lib/emailInbox";
import { checkSentDrafts } from "@/lib/feedback";
import { refreshInstagramToken } from "@/lib/instagram";
import { importMoods } from "@/lib/mood";
import { supabaseConfigured } from "@/lib/supabase";

// Vercel Cron, once a day (vercel.json), with `Authorization: Bearer <CRON_SECRET>`:
// - renews the Gmail watch (it stops after 7 days) and catches up on any missed email
// - refreshes the Instagram token every 7 days (Meta's tokens last 60 days)
// - compares email drafts staff have sent with Clara's draft (📚 Knowledge → Feedback)
// - stores the mood of any conversation of the last 2 days the post-call webhook missed (😊 Mood)
// Each job runs even if the other fails.
export async function GET(request: Request) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (!(await secretMatches(bearer, process.env.CRON_SECRET))) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [gmail, instagramToken, sentDrafts, moods] = await Promise.allSettled([
    emailChannelConfigured()
      ? startInboxWatch().then(async (watch) => ({ watchExpiresAt: watch.expiresAt, ...(await processInbox(watch.historyId)) }))
      : Promise.resolve({ skipped: "email channel not configured" }),
    supabaseConfigured() && process.env.INSTAGRAM_ACCESS_TOKEN
      ? refreshInstagramToken()
      : Promise.resolve({ skipped: "Instagram not configured" }),
    emailChannelConfigured() && supabaseConfigured()
      ? checkSentDrafts().then((corrections) => ({ corrections }))
      : Promise.resolve({ skipped: "email channel not configured" }),
    supabaseConfigured() ? importMoods({ days: 2, max: 100 }) : Promise.resolve({ skipped: "database not configured" }),
  ]);

  const report = (result: PromiseSettledResult<unknown>) => {
    if (result.status === "fulfilled") return result.value;
    console.error("daily job failed", result.reason);
    return { error: result.reason instanceof Error ? result.reason.message : "failed" };
  };
  return Response.json({
    gmail: report(gmail),
    instagramToken: report(instagramToken),
    sentDrafts: report(sentDrafts),
    moods: report(moods),
  });
}
