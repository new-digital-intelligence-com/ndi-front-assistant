import { hasValidWebhookSignature } from "@/lib/agentAuth";
import { storeReply, type AlexaReply } from "@/lib/alexa";

// Reply Webhook URL of Ellie's "CDA Alexa" Custom Channel trigger: her answer is kept for a moment
// until /api/alexa reads it out. Signed with that trigger's Outbound Signing Secret.
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("elevenlabs-signature");
  if (!(await hasValidWebhookSignature(rawBody, signature, process.env.ALEXA_CHANNEL_SIGNING_SECRET))) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }
  let payload: AlexaReply;
  try {
    payload = JSON.parse(rawBody) as AlexaReply;
  } catch {
    return Response.json({ ok: true, ignored: "unreadable body" });
  }
  try {
    return Response.json({ ok: true, ...(await storeReply(payload)) });
  } catch (error) {
    console.error("alexa reply failed", error);
    return Response.json({ error: "Could not keep the answer" }, { status: 500 });
  }
}
