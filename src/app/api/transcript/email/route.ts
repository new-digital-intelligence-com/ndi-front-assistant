import { cookies } from "next/headers";
import { signedInCustomerId } from "@/lib/account";
import { customerForConversation, findByChannel, normaliseEmail } from "@/lib/customers";
import { elevenLabsConversation, type ConversationRecord } from "@/lib/elevenlabs";
import { mailConfigured, sendMail } from "@/lib/mailer";
import { hasValidSession } from "@/lib/session";
import { formatDate, transcriptEmail } from "@/lib/transcriptEmail";
import { VISITOR_COOKIE } from "@/lib/visitor";

/** ElevenLabs finishes the transcript a few seconds after a conversation ends. */
const WAIT_FOR_TRANSCRIPT_MS = 20_000;

// Emails a website conversation with Ellie (chat, voice or the avatar) to the address typed in.
// The text comes from ElevenLabs' own transcript, never from the browser, and only the browser that
// had the conversation can ask for it: the conversation was registered to this person when it
// started (see src/lib/websiteSession.ts).
export async function POST(request: Request) {
  if (!(await hasValidSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!mailConfigured()) return Response.json({ error: "Email is not configured" }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
  const to = normaliseEmail(body.email);
  if (!to) return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
  if (!/^conv_[A-Za-z0-9_]+$/.test(conversationId)) {
    return Response.json({ error: "There is no conversation to send yet." }, { status: 400 });
  }

  const owner = await customerForConversation(conversationId);
  if (!owner || !(await requesterIds()).includes(owner.id)) {
    return Response.json({ error: "This conversation is not yours to send." }, { status: 403 });
  }

  // A conversation that never really started has no record at ElevenLabs at all.
  const record = await finishedTranscript(conversationId).catch(() => null);
  if (!record) return Response.json({ error: "This conversation has no messages yet." }, { status: 409 });
  const lines = (record.transcript ?? [])
    .filter((turn) => turn.message?.trim())
    .map((turn) => ({ speaker: turn.role === "agent" ? "Ellie" : "You", text: turn.message!.trim(), highlight: turn.role === "agent" }));
  if (lines.length === 0) return Response.json({ error: "This conversation has no messages yet." }, { status: 409 });

  const started = record.metadata?.start_time_unix_secs;
  const kind = record.metadata?.text_only ? "chat" : "voice conversation";
  const { text, html } = transcriptEmail({
    heading: `Your ${kind} with Ellie, CDA's virtual assistant`,
    intro: started ? formatDate(started * 1000) : "Your conversation",
    lines,
  });

  try {
    await sendMail({ to, subject: `Your conversation with CDA's assistant Ellie`, text, html });
  } catch (error) {
    console.error("Could not email the conversation", error);
    return Response.json({ error: "The email could not be sent. Please try again." }, { status: 502 });
  }
  return Response.json({ ok: true, sentTo: to });
}

/** The customer records this browser can speak for: its CDA account and its website cookie. */
async function requesterIds(): Promise<string[]> {
  const ids: string[] = [];
  const accountId = await signedInCustomerId().catch(() => null);
  if (accountId) ids.push(accountId);
  const cookie = (await cookies()).get(VISITOR_COOKIE)?.value;
  if (cookie) {
    const visitor = await findByChannel({ channel: "website", key: cookie }).catch(() => null);
    if (visitor) ids.push(visitor.customer.id);
  }
  return ids;
}

async function finishedTranscript(conversationId: string): Promise<ConversationRecord> {
  const deadline = Date.now() + WAIT_FOR_TRANSCRIPT_MS;
  let record = await elevenLabsConversation(conversationId);
  while ((record.status === "processing" || record.status === "initiated") && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    record = await elevenLabsConversation(conversationId);
  }
  return record;
}
