import { hasValidWebhookSignature } from "@/lib/agentAuth";
import { handleAssistantReply, type ReplyWebhook } from "@/lib/emailInbox";

// The "Reply Webhook URL" of Clara's email Custom Channel trigger: ElevenLabs posts her answer
// here after every email. Signed with that trigger's own Outbound Signing Secret. Instagram and
// Messenger have Custom Channel triggers of their own, whose replies go to their own routes.
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("elevenlabs-signature");
  if (!(await hasValidWebhookSignature(rawBody, signature, process.env.EMAIL_CHANNEL_SIGNING_SECRET))) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: ReplyWebhook;
  try {
    payload = JSON.parse(rawBody) as ReplyWebhook;
  } catch {
    return Response.json({ ok: true, ignored: "unreadable body" });
  }

  try {
    return Response.json({ ok: true, ...(await handleAssistantReply(payload)) });
  } catch (error) {
    // 500 so ElevenLabs delivers it again; the email is already marked failed in the meantime.
    console.error("assistant-reply failed", error);
    return Response.json({ error: "The reply could not be sent" }, { status: 500 });
  }
}
