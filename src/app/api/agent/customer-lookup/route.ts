import { hasValidToolSecret } from "@/lib/agentAuth";
import { isRobotAddress } from "@/lib/emailParse";
import {
  customerForChannel,
  customerForConversation,
  customerStoreConfigured,
  mayBeRegisteredLate,
  profileFor,
  rememberConversation,
  resolveIdentity,
  type Identity,
  type Profile,
} from "@/lib/customers";
import { callBrief, type CallBrief } from "@/lib/outboundCalls";

const LATE_REGISTRATION_CHECKS = 3;
const LATE_REGISTRATION_WAIT_MS = 400;

/**
 * Only say "found" when there is something worth saying, not merely that a row exists. On a call
 * CDA made from a staff call list, outbound_call tells Ellie whom she rang and why (never the number).
 */
function answer(profile: Profile | null, brief: CallBrief | null) {
  const found = profile ? Boolean(profile.name) || profile.recent.length > 0 : false;
  const outbound = brief ? { customer_name: brief.customer_name, instructions: brief.instructions } : null;
  return Response.json({ found, ...(profile ?? {}), ...(outbound ? { outbound_call: outbound } : {}) });
}

// Tool `customer_lookup`: Ellie calls this silently at the start of every conversation. She says
// nothing until it answers, which on a phone call is heard, so everything that can be asked at the
// same time is.
//
// Anything that goes wrong answers "not found" with status 200 on purpose: a customer must never
// see an error because a lookup failed. Problems are logged for us instead.
export async function POST(request: Request) {
  if (!(await hasValidToolSecret(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!customerStoreConfigured()) {
      console.error("customer-lookup: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set");
      return Response.json({ found: false });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const conversationId = typeof body.conversation_id === "string" ? body.conversation_id : "";

    const [brief, registered] = await Promise.all([
      callBrief(conversationId).catch((error) => {
        console.error("customer-lookup: call list lookup failed", error);
        return null;
      }),
      // Website chat, voice and the avatar registered themselves when their session was created.
      customerForConversation(conversationId),
    ]);
    if (registered) return answer(await profileFor(registered), brief);

    // A call from the staff call list: the number is known already, nothing else to work out.
    const identity: Identity | null = brief
      ? { channel: "phone", key: brief.phone, name: brief.customer_name ?? undefined }
      : await resolveIdentity(body);
    if (!identity) {
      // An email is registered a moment after Ellie receives it, so give that a second to land.
      for (let attempt = 0; attempt < LATE_REGISTRATION_CHECKS && mayBeRegisteredLate(conversationId); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, LATE_REGISTRATION_WAIT_MS));
        const late = await customerForConversation(conversationId);
        if (late) return answer(await profileFor(late), brief);
      }
      return answer(null, brief);
    }

    // No-reply and notification senders are robots, not customers: they get no record at all.
    if (identity.channel === "email" && isRobotAddress(identity.key)) return answer(null, brief);

    // First time on this channel: remember it anyway, so the next conversation on the same channel
    // picks up where this one left off. An email address comes from the email itself (the Gmail
    // message or the Freshdesk ticket), which is taken as proof; a Telegram chat id or a phone number
    // proves nothing until the person links it from their account.
    const customer = await customerForChannel(identity, identity.channel === "email");
    const [profile] = await Promise.all([
      profileFor(customer),
      rememberConversation(conversationId, customer.id, identity.channel),
    ]);
    return answer(profile, brief);
  } catch (error) {
    console.error("customer-lookup failed", error);
    return Response.json({ found: false });
  }
}
