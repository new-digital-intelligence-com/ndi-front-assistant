import { hasValidWebhookSignature } from "@/lib/agentAuth";
import { addAppliances, addNote } from "@/lib/customers";
import { recordSaidFeedback } from "@/lib/feedback";
import { recordGaps } from "@/lib/knowledge";
import { recordConversationMood, type ConversationForMood } from "@/lib/mood";
import { callEnded } from "@/lib/outboundCalls";

/** Notes are a reminder, not a transcript: a few lines are enough for the next conversation. */
const MAX_NOTE_LENGTH = 700;

/** A long summary is cut at the end of a sentence, not in the middle of one. */
function shortNote(summary: string): string {
  if (summary.length <= MAX_NOTE_LENGTH) return summary;
  const cut = summary.slice(0, MAX_NOTE_LENGTH);
  const end = cut.lastIndexOf(". ");
  return end > MAX_NOTE_LENGTH / 2 ? cut.slice(0, end + 1) : cut;
}

// ElevenLabs post-call webhook. It fires after every conversation on every channel, which is why
// the memory is written here instead of costing an extra tool call during the chat.
export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!(await hasValidWebhookSignature(rawBody, request.headers.get("elevenlabs-signature")))) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: {
    type?: string;
    data?: {
      conversation_id?: string;
      failure_reason?: string;
      metadata?: { phone_call?: unknown };
      analysis?: {
        transcript_summary?: string;
        data_collection_results?: Record<string, { value?: unknown } | undefined>;
      };
    };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: true, ignored: "unreadable body" });
  }

  // A call from a staff call list ended or never connected: the list moves on to the next number
  // now. Never fatal: the staff page moves lists on as well.
  if (event.data?.conversation_id && (event.type === "post_call_transcription" || event.type === "call_initiation_failure")) {
    const failure = event.type === "call_initiation_failure" ? event.data.failure_reason || "unknown" : undefined;
    await callEnded(event.data.conversation_id, failure).catch((error) => console.error("call list update failed", error));
  }

  // Only the transcription event carries a summary; other event types are acknowledged and dropped.
  if (event.type !== "post_call_transcription") return Response.json({ ok: true, ignored: event.type });

  // Questions Ellie could not answer (her "unanswered_question" analysis item) wait on /admin for
  // staff to write the answer. Never fatal: the note below matters more.
  const results = event.data?.analysis?.data_collection_results;
  const unanswered = results?.unanswered_question?.value;
  const isPhoneCall = Boolean(event.data?.metadata?.phone_call);
  if (event.data?.conversation_id && unanswered) {
    await recordGaps(event.data.conversation_id, unanswered, isPhoneCall).catch((error) =>
      console.error("knowledge gap could not be stored", error),
    );
  }
  // The customer's appliances (model, type, purchase date): Ellie gets them back on every channel,
  // so she never asks twice for a model number she has already seen on a receipt or rating plate.
  if (event.data?.conversation_id && results?.appliance?.value) {
    await addAppliances(event.data.conversation_id, results.appliance.value).catch((error) =>
      console.error("appliances could not be stored", error),
    );
  }

  // What the customer said about Ellie's answers ("that's wrong", "perfect"): the weekly score, and a
  // complaint waits for staff next to the unanswered questions.
  if (event.data?.conversation_id) {
    await recordSaidFeedback(event.data.conversation_id, results, isPhoneCall).catch((error) =>
      console.error("feedback could not be stored", error),
    );
  }

  // The customer's mood (ElevenLabs' sentiment scores) for /admin → 😊 Mood; staff are emailed when
  // the customer was upset or Ellie promised a follow-up. Never fatal: the note below still matters.
  if (event.data?.conversation_id) {
    await recordConversationMood(event.data as ConversationForMood, { alert: true }).catch((error) =>
      console.error("mood could not be stored", error),
    );
  }

  const conversationId = event.data?.conversation_id;
  const summary = event.data?.analysis?.transcript_summary?.trim();
  if (!conversationId || !summary) return Response.json({ ok: true, ignored: "no summary" });

  try {
    // False simply means nobody was identified in that conversation, which is the normal case.
    const saved = await addNote(conversationId, shortNote(summary));
    return Response.json({ ok: true, saved });
  } catch (error) {
    console.error("post-call note failed", error);
    // 500 so ElevenLabs retries; the note is worth a second attempt.
    return Response.json({ error: "Could not store the note" }, { status: 500 });
  }
}
