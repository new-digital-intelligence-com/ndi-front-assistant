// Feedback on Ellie's answers, from four places, all ending on /admin (📚 Knowledge → Feedback):
//
//   1. 👍 / 👎 under each answer in the website chat (a 👎 asks "What was wrong?")
//   2. What customers say about an answer on any channel ("that's wrong", "perfect, thanks"),
//      picked up by ElevenLabs' post-call analysis (the feedback_* data collection items)
//   3. Aida rooms: staff changed Aida's draft before sending it
//   4. Email draft mode: staff changed Ellie's draft before sending it
//
// Every rating counts towards the weekly score. Negative feedback and real corrections wait for
// staff, who turn them into an approved answer ("CDA approved FAQ") or dismiss them. Nothing
// reaches Ellie without that approval: an edit fixes one reply for one customer, and often carries
// their name or order, so making it the answer for everyone is a separate decision.

import { listEvents } from "./aida";
import { parseGmailMessage, type GmailMessage } from "./emailParse";
import { draftExists, getMessage, getThread } from "./gmail";
import { conversationChannel } from "./customers";
import { supabaseRest as rest } from "./supabase";

const q = encodeURIComponent;
const MAX_TEXT = 2_000;
/** Drafts older than this are not followed any more. */
const DRAFT_FOLLOW_DAYS = 14;
/** Email drafts checked per look, so the staff page stays quick. */
const DRAFTS_PER_CHECK = 5;
/** Aida's notes for staff at the start of a draft ("[Check] …") are never sent, so never compared. */
const STAFF_NOTE = /^\s*\[([^\]]+)\]\s*/;

export type FeedbackItem = {
  id: number;
  /** feedback from a customer; correction = staff changed a fact; style = staff only reworded the draft. */
  kind: "feedback" | "correction" | "style";
  source: "chat" | "said" | "aida" | "email";
  channel: string | null;
  conversation_id: string | null;
  question: string | null;
  original_answer: string | null;
  comment: string | null;
  corrected_answer: string | null;
  created_at: string;
};

export type Rating = "like" | "dislike";

const clip = (value: unknown, max = MAX_TEXT) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);

// --- is an edit a correction? ----------------------------------------------------------------------

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 400);

function commonWords(a: string[], b: string[]): number {
  let previous = new Array<number>(b.length + 1).fill(0);
  for (const word of a) {
    const current = new Array<number>(b.length + 1).fill(0);
    for (let j = 0; j < b.length; j++) current[j + 1] = word === b[j] ? previous[j] + 1 : Math.max(previous[j + 1], current[j]);
    previous = current;
  }
  return previous[b.length];
}

const numbersIn = (text: string) => [...new Set(text.match(/\d[\d\s]*\d|\d/g)?.map((n) => n.replace(/\s/g, "")) ?? [])].sort().join(",");

const GREETING = /^(hi|hello|hey|dear|good (morning|afternoon|evening)|thank(s| you)|many thanks)\b/i;
const SIGN_OFF = /\b(regards|wishes|cheers|sincerely|best|thanks|thank you|ellie|assistant|team|care)\b/i;
const wordCount = (sentence: string) => sentence.split(/\s+/).filter(Boolean).length;

/** The message without its greeting and sign-off, which staff change for style, not for facts. */
function body(text: string): string {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  while (sentences.length > 1 && wordCount(sentences[0]) <= 8 && GREETING.test(sentences[0])) sentences.shift();
  while (sentences.length > 1) {
    const last = sentences[sentences.length - 1];
    if (wordCount(last) > 6 || !(SIGN_OFF.test(last) || wordCount(last) <= 2)) break;
    sentences.pop();
  }
  return sentences.join(" ");
}

/**
 * A changed fact, not a polish. A changed number (phone, price, date, model) always counts; otherwise
 * at least 6 words and 15% of the text must differ. The greeting and sign-off are left out first, so
 * a new "Dear Mario" or "Kind regards, Jean", or a typo, is not a correction.
 */
export function isRealCorrection(originalText: string, correctedText: string): boolean {
  const original = body(originalText);
  const corrected = body(correctedText);
  const a = words(original);
  const b = words(corrected);
  if (!b.length || a.join(" ") === b.join(" ")) return false;
  if (numbersIn(original) !== numbersIn(corrected)) return true;
  const longest = Math.max(a.length, b.length);
  const changed = longest - commonWords(a, b);
  return changed >= 6 && changed / longest >= 0.15;
}

export type DraftOutcome = "unchanged" | "polished" | "corrected" | "declined" | "discarded";

/** What staff did to a draft before sending it: nothing, style only, or a real correction. */
export function editKind(draft: string, sent: string): "unchanged" | "polished" | "corrected" {
  if (words(draft).join(" ") === words(sent).join(" ")) return "unchanged";
  return isRealCorrection(draft, sent) ? "corrected" : "polished";
}

// --- storing ------------------------------------------------------------------------------------------

/** One outcome per draft, for the "right first time" score. Only a statistic: never stops the rest. */
async function saveOutcome(ref: string, source: "email" | "aida", outcome: DraftOutcome) {
  await rest("draft_outcomes?on_conflict=ref", {
    method: "POST",
    prefer: "resolution=ignore-duplicates,return=minimal",
    body: JSON.stringify({ ref, source, outcome }),
  }).catch((error) => console.error("draft outcome not counted", ref, error));
}

async function saveItem(item: Omit<FeedbackItem, "id" | "created_at"> & { ref: string }, update = false) {
  await rest("knowledge_feedback?on_conflict=ref", {
    method: "POST",
    prefer: `resolution=${update ? "merge-duplicates" : "ignore-duplicates"},return=minimal`,
    body: JSON.stringify(item),
  });
}

async function saveRating(rating: { ref: string; conversation_id: string | null; channel: string | null; rating: Rating; source: "button" | "said" }) {
  await rest("feedback_ratings?on_conflict=ref", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify(rating),
  });
}

/** Shows the rating on the conversation in ElevenLabs too. Theirs is one rating per conversation. */
async function rateInElevenLabs(conversationId: string, rating: Rating) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return;
  const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${q(conversationId)}/feedback`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ feedback: rating }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`ElevenLabs feedback failed with ${response.status}`);
}

// --- 1. the chat buttons -----------------------------------------------------------------------------

/** 👍 or 👎 on one answer in the website chat. Changing one's mind replaces the earlier rating. */
export async function recordButtonFeedback(input: {
  conversationId: string;
  messageId: string;
  rating: Rating;
  question: unknown;
  answer: unknown;
  comment: unknown;
}) {
  const ref = `chat:${input.conversationId}:${input.messageId}`;
  await saveRating({ ref, conversation_id: input.conversationId, channel: "website", rating: input.rating, source: "button" });
  if (input.rating === "dislike") {
    await saveItem(
      {
        ref,
        kind: "feedback",
        source: "chat",
        channel: "website",
        conversation_id: input.conversationId,
        question: clip(input.question),
        original_answer: clip(input.answer),
        comment: clip(input.comment, 1_000),
        corrected_answer: null,
      },
      true,
    );
  } else {
    await rest(`knowledge_feedback?ref=eq.${q(ref)}&status=eq.open`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ status: "dismissed" }),
    });
  }
  await rateInElevenLabs(input.conversationId, input.rating).catch((error) => console.error("ElevenLabs feedback failed", error));
}

// --- 2. what the customer said --------------------------------------------------------------------

type Results = Record<string, { value?: unknown } | undefined>;

/**
 * From ElevenLabs' post-call analysis: praise counts as 👍, a complaint as 👎 and waits for staff.
 * A website chat where the customer already used the buttons is not counted twice.
 */
export async function recordSaidFeedback(conversationId: string, results: Results | undefined, isPhoneCall = false) {
  const sentiment = results?.feedback_sentiment?.value;
  if (sentiment !== "positive" && sentiment !== "negative") return;
  const buttons = await rest<{ id: number }[]>(`feedback_ratings?ref=like.${q(`chat:${conversationId}:`)}*&select=id&limit=1`);
  if (buttons.length) return;

  const channel = await conversationChannel(conversationId, isPhoneCall).catch(() => null);
  const ref = `said:${conversationId}`;
  await saveRating({ ref, conversation_id: conversationId, channel, rating: sentiment === "positive" ? "like" : "dislike", source: "said" });
  if (sentiment === "negative") {
    await saveItem({
      ref,
      kind: "feedback",
      source: "said",
      channel,
      conversation_id: conversationId,
      question: clip(results?.feedback_question?.value),
      original_answer: clip(results?.feedback_answer?.value),
      comment: clip(results?.feedback_comment?.value, 1_000),
      corrected_answer: null,
    });
  }
}

// --- 3 and 4. staff corrections -----------------------------------------------------------------------

/** A draft staff changed before sending: a card, marked as a changed fact or as rewording only. */
async function recordCorrection(input: {
  ref: string;
  source: "aida" | "email";
  channel: string;
  conversationId: string | null;
  question: string | null;
  original: string;
  corrected: string;
  styleOnly: boolean;
}): Promise<boolean> {
  await saveItem({
    ref: input.ref,
    kind: input.styleOnly ? "style" : "correction",
    source: input.source,
    channel: input.channel,
    conversation_id: input.conversationId,
    question: clip(input.question),
    original_answer: clip(input.original),
    comment: null,
    corrected_answer: clip(input.corrected),
  });
  return true;
}

/** An Aida room: staff sent `sent` for draft `draftRef`. Compared with what Aida wrote. */
export async function aidaDraftSent(roomId: string, draftRef: string, sent: string) {
  const events = await listEvents(roomId, "employee");
  const draft = events.find((event) => event.kind === "suggestion" && event.ref === draftRef);
  if (!draft?.text) return;
  const written = draft.text.replace(STAFF_NOTE, "").trim();
  const kind = editKind(written, sent);
  await saveOutcome(`aida:${roomId}:${draftRef}`, "aida", kind);
  if (kind === "unchanged") return;
  // What Aida was answering: the customer's last words before her draft.
  const asked = events.filter(
    (event) => event.id < draft.id && event.author_role === "customer" && (event.kind === "speech" || event.kind === "chat"),
  );
  await recordCorrection({
    ref: `aida:${roomId}:${draftRef}`,
    source: "aida",
    channel: "aida",
    conversationId: null,
    question: asked.at(-1)?.text ?? null,
    original: written,
    corrected: sent,
    styleOnly: kind === "polished",
  });
}

/** An Aida room: staff declined draft `draftRef`. */
export async function aidaDraftDeclined(roomId: string, draftRef: string) {
  await saveOutcome(`aida:${roomId}:${draftRef}`, "aida", "declined");
}

/** An email reply as typed, without the quoted email below it ("On … wrote:", "> …"). */
export function withoutQuotedHistory(text: string): string {
  const cut = text.search(/\n\s*(On [^\n]{0,200}(\n[^\n]{0,200})?wrote:|-{2,}\s*Original Message|Le [^\n]{0,200}a écrit\s*:)/i);
  return (cut >= 0 ? text.slice(0, cut) : text)
    .split("\n")
    .filter((line) => !line.trim().startsWith(">"))
    .join("\n")
    .trim();
}

type DraftRow = {
  gmail_id: string;
  thread_id: string;
  draft_id: string;
  ellie_reply: string | null;
  subject: string | null;
  conversation_id: string | null;
};

/**
 * Email draft mode: finds drafts staff have since sent, and compares what went out with Ellie's
 * draft. Run when staff open the Knowledge tab and by the daily cron. A draft deleted without being
 * sent is simply forgotten.
 */
export async function checkSentDrafts(): Promise<number> {
  const since = new Date(Date.now() - DRAFT_FOLLOW_DAYS * 86_400_000).toISOString();
  const rows = await rest<DraftRow[]>(
    `email_messages?status=eq.draft&draft_id=not.is.null&reply_checked_at=is.null&created_at=gt.${q(since)}` +
      `&select=gmail_id,thread_id,draft_id,ellie_reply,subject,conversation_id&order=created_at.desc&limit=${DRAFTS_PER_CHECK}`,
  );
  let found = 0;
  for (const row of rows) {
    try {
      if (await draftExists(row.draft_id)) continue; // still waiting in Gmail
      const [customerEmail, thread] = await Promise.all([getMessage(row.gmail_id), getThread(row.thread_id)]);
      const receivedAt = Number(customerEmail?.internalDate ?? 0);
      const sent = thread
        .filter((message: GmailMessage) => message.labelIds?.includes("SENT") && Number(message.internalDate ?? 0) > receivedAt)
        .sort((a, b) => Number(a.internalDate ?? 0) - Number(b.internalDate ?? 0))[0];
      if (!sent) {
        await saveOutcome(`email:${row.gmail_id}`, "email", "discarded");
      } else if (row.ellie_reply) {
        const sentText = withoutQuotedHistory(parseGmailMessage(sent).text);
        const kind = editKind(row.ellie_reply, sentText);
        await saveOutcome(`email:${row.gmail_id}`, "email", kind);
        if (kind !== "unchanged") {
          const asked = customerEmail ? withoutQuotedHistory(parseGmailMessage(customerEmail).text) : "";
          const question = [row.subject, asked].filter(Boolean).join(" — ").slice(0, 600);
          if (await recordCorrection({
            ref: `email:${row.gmail_id}`,
            source: "email",
            channel: "email",
            conversationId: row.conversation_id,
            question: question || null,
            original: row.ellie_reply,
            corrected: sentText,
            styleOnly: kind === "polished",
          })) found++;
        }
      }
      await rest(`email_messages?gmail_id=eq.${q(row.gmail_id)}`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: JSON.stringify({ reply_checked_at: new Date().toISOString() }),
      });
    } catch (error) {
      console.error("sent draft check failed", row.gmail_id, error);
    }
  }
  return found;
}

// --- for the admin page -----------------------------------------------------------------------------

export async function openFeedback(): Promise<FeedbackItem[]> {
  return rest<FeedbackItem[]>(
    "knowledge_feedback?status=eq.open&select=id,kind,source,channel,conversation_id,question,original_answer,comment,corrected_answer,created_at&order=created_at.desc&limit=100",
  );
}

/** 👍 / 👎 in the last 7 days, from the buttons and from what customers said. */
export async function weekScore(): Promise<{ likes: number; dislikes: number }> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const rows = await rest<{ rating: Rating }[]>(`feedback_ratings?created_at=gt.${q(since)}&select=rating&limit=10000`);
  return {
    likes: rows.filter((row) => row.rating === "like").length,
    dislikes: rows.filter((row) => row.rating === "dislike").length,
  };
}

export type DraftCounts = Record<DraftOutcome, number> & { total: number };

/** What happened to Ellie's email drafts and Aida's drafts in the last 7 days. */
export async function draftStats(): Promise<{ email: DraftCounts; aida: DraftCounts }> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const rows = await rest<{ source: string; outcome: DraftOutcome }[]>(
    `draft_outcomes?created_at=gt.${q(since)}&select=source,outcome&limit=10000`,
  ).catch((error) => {
    console.error("draft outcomes could not be read", error);
    return [];
  });
  const count = (source: string): DraftCounts => {
    const mine = rows.filter((row) => row.source === source);
    const of = (outcome: DraftOutcome) => mine.filter((row) => row.outcome === outcome).length;
    return {
      total: mine.length,
      unchanged: of("unchanged"),
      polished: of("polished"),
      corrected: of("corrected"),
      declined: of("declined"),
      discarded: of("discarded"),
    };
  };
  return { email: count("email"), aida: count("aida") };
}

export async function closeFeedback(ids: number[], status: "answered" | "dismissed", faqId?: number) {
  if (!ids.length) return;
  await rest(`knowledge_feedback?id=in.(${ids.join(",")})`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ status, ...(faqId ? { faq_id: faqId } : {}) }),
  });
}
