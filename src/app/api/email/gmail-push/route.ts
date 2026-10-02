import { secretMatches } from "@/lib/agentAuth";
import { emailChannelConfigured, processInbox } from "@/lib/emailInbox";
import { mailboxAddress } from "@/lib/gmail";

// Google Pub/Sub calls this when the CDA inbox changes (a push subscription on the topic Gmail
// posts to). There is no browser and no site password: the secret in the subscription's URL is
// the proof, and anything without it is refused.
//
// 2xx tells Pub/Sub the notification is handled; anything else makes it deliver it again later.
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!(await secretMatches(token, process.env.GMAIL_PUSH_SECRET))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!emailChannelConfigured()) {
    // Not an error Pub/Sub can fix by retrying; the next notification after setup catches up.
    console.error("gmail-push: the email channel is not configured");
    return Response.json({ ok: false, reason: "not configured" });
  }

  const body = (await request.json().catch(() => ({}))) as { message?: { data?: string } };
  let notification: { emailAddress?: string; historyId?: number | string } = {};
  try {
    notification = JSON.parse(Buffer.from(body.message?.data ?? "", "base64").toString("utf8"));
  } catch {
    return Response.json({ ok: true, ignored: "unreadable notification" });
  }
  if (notification.emailAddress?.toLowerCase() !== mailboxAddress()) {
    return Response.json({ ok: true, ignored: "another mailbox" });
  }

  try {
    const result = await processInbox(notification.historyId ? String(notification.historyId) : null);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    // Gmail or Supabase is having a moment: let Pub/Sub deliver it again.
    console.error("gmail-push failed", error);
    return Response.json({ error: "Could not read the inbox" }, { status: 500 });
  }
}
