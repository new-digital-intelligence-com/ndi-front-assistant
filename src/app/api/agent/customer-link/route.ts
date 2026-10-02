import { hasValidToolSecret } from "@/lib/agentAuth";
import { customerStoreConfigured, redeemLinkCode, rememberConversation, resolveIdentity } from "@/lib/customers";

// Tool `customer_link`: the customer signed in on the website, got a short code, and sent it from
// this channel. Redeeming it ties this channel to their account, so their history follows them.
//
// Ellie never asks anyone for an email address; this code is the only way a person links a channel.
export async function POST(request: Request) {
  if (!(await hasValidToolSecret(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!customerStoreConfigured()) {
      console.error("customer-link: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set");
      return Response.json({ ok: false, reason: "unavailable" });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const code = typeof body.code === "string" ? body.code : "";
    if (!code.trim()) return Response.json({ ok: false, reason: "no_code" });

    const identity = await resolveIdentity(body);
    if (!identity) return Response.json({ ok: false, reason: "unknown_channel" });

    const result = await redeemLinkCode(code, identity);
    if (!result.ok) return Response.json(result);

    const conversationId = typeof body.conversation_id === "string" ? body.conversation_id : "";
    await rememberConversation(conversationId, result.customer.id, identity.channel);

    return Response.json({ ok: true, ...result.profile });
  } catch (error) {
    console.error("customer-link failed", error);
    return Response.json({ ok: false, reason: "unavailable" });
  }
}
