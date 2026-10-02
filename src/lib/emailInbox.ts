// Email on the NDI mailbox:
//
//   customer email -> Gmail -> Pub/Sub push -> /api/email/gmail-push
//        -> rules skip codes, alerts and newsletters (no credits spent)
//        -> Clara, through an ElevenLabs Custom Channel trigger of its own
//   Clara's answer -> /api/email/assistant-reply -> email_mode on Aida
//        -> "auto": sent in the customer's thread    -> label Clara/Replied
//        -> "draft": a Gmail draft in that thread    -> label Clara/Draft ready
//   An upset customer (Claude rates each email's mood first) is never answered automatically: the
//   answer becomes a draft, labelled Clara/Upset customer as well, and staff are emailed.
//
// Supabase keeps one row per email (email_messages), which is also what stops Gmail's or
// ElevenLabs' repeated deliveries from producing a second reply. It keeps who wrote and the
// subject, never the text.

import { customerForChannel, forgetRobotSender, rememberConversation } from "./customers";
import { getEmailMode } from "./replyMode";
import { withoutQuotedHistory } from "./feedback";
import { isUpsetEmail, markAlerted, rateMessage, recordEmailMood, type QuickMood } from "./mood";
import { sendMoodAlert } from "./moodAlert";
import { automatedReason, buildReply, isSkip, parseGmailMessage, plainReply, replySubject, textForAssistant, type IncomingEmail } from "./emailParse";
import {
  createDraft,
  getMessage,
  GmailError,
  gmailConfigured,
  inboxArrivalsSince,
  labelOutcome,
  labelUpset,
  mailboxAddress,
  sendRaw,
  watchInbox,
  type Outcome,
} from "./gmail";
import { supabaseConfigured, supabaseRest as rest } from "./supabase";

type Status = "new" | "waiting" | "replying" | "sent" | "draft" | "skipped" | "failed";

export type EmailRow = {
  gmail_id: string;
  thread_id: string;
  from_email: string | null;
  from_name: string | null;
  reply_to: string | null;
  subject: string | null;
  message_id: string | null;
  references_header: string | null;
  status: Status;
  reason: string | null;
  conversation_id: string | null;
  mode: string | null;
  created_at: string;
  /** Draft mode: the Gmail draft and Clara's text, to compare with what staff finally send. */
  draft_id?: string | null;
  assistant_reply?: string | null;
  /** The email's mood, rated by Claude before Clara saw it (null before schema.sql is re-run). */
  mood_label?: string | null;
  mood_frustration?: number | null;
  mood_reason?: string | null;
  received_at?: string | null;
};

/** Mail older than this is never answered, e.g. an old email moved back into the inbox. */
const MAX_AGE_MS = 24 * 3_600_000;
/** More than this many emails from one sender in an hour looks like a robot or a loop. */
const MAX_PER_SENDER_PER_HOUR = 5;
/** Ties Clara's reply back to the email: ElevenLabs returns it in user_message_ids. */
const MESSAGE_ID_PREFIX = "email|";

const q = encodeURIComponent;

export function emailChannelConfigured(): boolean {
  return (
    gmailConfigured() &&
    supabaseConfigured() &&
    Boolean(process.env.EMAIL_CHANNEL_INBOUND_URL && process.env.EMAIL_CHANNEL_INBOUND_SECRET)
  );
}

// --- where Gmail push has got to ---------------------------------------------------------------

async function savedHistoryId(): Promise<string | null> {
  const rows = await rest<{ history_id: number }[]>("gmail_state?id=eq.1&select=history_id");
  return rows[0] ? String(rows[0].history_id) : null;
}

/** Only ever moves forward, so two notifications handled at once cannot go back in time. */
async function advanceHistoryId(historyId: string) {
  await rest(`gmail_state?id=eq.1&history_id=lt.${q(historyId)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ history_id: historyId, updated_at: new Date().toISOString() }),
  });
}

/** Starts or renews the watch. The first time, everything already in the inbox is left alone. */
export async function startInboxWatch(): Promise<{ historyId: string; expiresAt: string }> {
  const watch = await watchInbox();
  const expiresAt = new Date(Number(watch.expiration)).toISOString();
  await rest("gmail_state?on_conflict=id", {
    method: "POST",
    prefer: "resolution=ignore-duplicates,return=minimal",
    body: JSON.stringify({ id: 1, history_id: watch.historyId }),
  });
  await rest("gmail_state?id=eq.1", {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ watch_expires_at: expiresAt, updated_at: new Date().toISOString() }),
  });
  return { historyId: watch.historyId, expiresAt };
}

/**
 * Gmail's notification only says "something changed, the mailbox is now at history X". Read
 * what arrived since we last looked and handle each new email once.
 */
export async function processInbox(notifiedHistoryId: string | null): Promise<{ checked: number }> {
  const start = await savedHistoryId();
  if (!start) {
    // The watch was never started through startInboxWatch: begin from here, answer nothing old.
    if (notifiedHistoryId) {
      await rest("gmail_state?on_conflict=id", {
        method: "POST",
        prefer: "resolution=ignore-duplicates,return=minimal",
        body: JSON.stringify({ id: 1, history_id: notifiedHistoryId }),
      });
    }
    return { checked: 0 };
  }

  let arrivals: { ids: string[]; historyId: string };
  try {
    arrivals = await inboxArrivalsSince(start);
  } catch (error) {
    // Gmail only keeps about a week of history. Start again from now rather than stall forever.
    if (error instanceof GmailError && error.status === 404 && notifiedHistoryId) {
      console.error("Gmail history too old, starting again from", notifiedHistoryId);
      await rest("gmail_state?id=eq.1", {
        method: "PATCH",
        prefer: "return=minimal",
        body: JSON.stringify({ history_id: notifiedHistoryId, updated_at: new Date().toISOString() }),
      });
      return { checked: 0 };
    }
    throw error;
  }

  for (const gmailId of arrivals.ids) {
    try {
      await handleIncoming(gmailId);
    } catch (error) {
      // One bad email must not hold up the others; it is marked failed where possible.
      console.error(`Email ${gmailId} could not be handled`, error);
    }
  }
  await advanceHistoryId(arrivals.historyId);
  return { checked: arrivals.ids.length };
}

// --- one incoming email ------------------------------------------------------------------------

/** Inserting the row is the lock: only the first delivery of a notification gets it. */
async function claim(email: IncomingEmail): Promise<boolean> {
  const rows = await rest<EmailRow[]>("email_messages?on_conflict=gmail_id", {
    method: "POST",
    prefer: "resolution=ignore-duplicates,return=representation",
    body: JSON.stringify({
      gmail_id: email.gmailId,
      thread_id: email.threadId,
      from_email: email.fromEmail,
      from_name: email.fromName,
      reply_to: email.replyTo,
      subject: email.subject.slice(0, 300),
      message_id: email.messageId,
      references_header: email.references?.slice(0, 4000) ?? null,
      received_at: email.receivedAt.toISOString(),
      status: "new",
    }),
  });
  return rows.length > 0;
}

/** Changes the row only if it is still in one of `from`, so a late or repeated step changes nothing. */
async function move(gmailId: string, from: Status[], changes: Partial<EmailRow>): Promise<boolean> {
  const rows = await rest<EmailRow[]>(`email_messages?gmail_id=eq.${q(gmailId)}&status=in.(${from.join(",")})`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify({ ...changes, updated_at: new Date().toISOString() }),
  });
  return rows.length > 0;
}

async function label(gmailId: string, outcome: Outcome) {
  try {
    await labelOutcome(gmailId, outcome);
  } catch (error) {
    // A missing label is cosmetic; the row in Supabase still says what happened.
    console.error(`Could not label email ${gmailId} as ${outcome}`, error);
  }
}

async function tooManyFromSender(fromEmail: string): Promise<boolean> {
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const rows = await rest<{ gmail_id: string }[]>(
    `email_messages?from_email=eq.${q(fromEmail)}&created_at=gt.${q(since)}&status=in.(new,waiting,replying,sent,draft)&select=gmail_id`,
  );
  // The email being handled is already one of them.
  return rows.length > MAX_PER_SENDER_PER_HOUR;
}

async function sendToAssistant(email: IncomingEmail): Promise<string> {
  const response = await fetch(process.env.EMAIL_CHANNEL_INBOUND_URL ?? "", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Webhook-Secret": process.env.EMAIL_CHANNEL_INBOUND_SECRET ?? "" },
    body: JSON.stringify({
      data: { type: "user_message", text: textForAssistant(email), user_identifier: email.fromEmail },
      user_message_id: `${MESSAGE_ID_PREFIX}${email.gmailId}`,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => ({}))) as { conversation_id?: string };
  if (!response.ok || !body.conversation_id) {
    throw new Error(`Custom Channel inbound failed with ${response.status}`);
  }
  return body.conversation_id;
}

/** Claude's rating of the email, kept on its row. A missing rating simply means "not upset". */
async function rateEmail(email: IncomingEmail): Promise<QuickMood | null> {
  const mood = await rateMessage(`Subject: ${email.subject || "(no subject)"}

${withoutQuotedHistory(email.text)}`, {
    timeoutMs: 12_000,
  });
  if (!mood) return null;
  await rest(`email_messages?gmail_id=eq.${q(email.gmailId)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ mood_label: mood.label, mood_frustration: mood.frustration, mood_reason: mood.reason || null }),
  }).catch((error) => console.error("email mood not stored (has supabase/schema.sql been run?)", error));
  return mood;
}

async function handleIncoming(gmailId: string) {
  const message = await getMessage(gmailId);
  if (!message) return;
  const email = parseGmailMessage(message);

  // Our own replies and drafts are not in the inbox; anything else that is not new mail is ignored.
  if (!email.labelIds.includes("INBOX") || email.labelIds.includes("SENT") || email.labelIds.includes("DRAFT")) return;
  if (email.fromEmail && email.fromEmail === mailboxAddress()) return;
  if (Date.now() - email.receivedAt.getTime() > MAX_AGE_MS) return;

  if (!(await claim(email))) return;

  const reason =
    automatedReason(email, mailboxAddress()) ??
    (email.fromEmail && (await tooManyFromSender(email.fromEmail)) ? "too many emails from this sender in an hour" : null);
  if (reason) {
    await move(gmailId, ["new"], { status: "skipped", reason });
    await label(gmailId, "skipped");
    return;
  }

  // Its mood, before Clara sees it: an upset customer is never answered automatically (😊 Mood).
  const mood = await rateEmail(email);

  // The sender's customer record comes first, so the conversation can be tied to it the moment
  // ElevenLabs names it: Clara's customer_lookup runs a second or so later and finds it. Receiving
  // an email from an address is taken as proof of that address.
  const customer = email.fromEmail
    ? await customerForChannel({ channel: "email", key: email.fromEmail, name: email.fromName ?? undefined }, true).catch(
        (error) => {
          console.error("Could not find the customer for an email", error);
          return null;
        },
      )
    : null;

  await move(gmailId, ["new"], { status: "waiting" });
  let conversationId: string;
  try {
    conversationId = await sendToAssistant(email);
  } catch (error) {
    console.error(`Email ${gmailId} could not be passed to Clara`, error);
    await move(gmailId, ["waiting"], { status: "failed", reason: "Clara could not be reached" });
    await label(gmailId, "failed");
    return;
  }

  await Promise.all([
    rest(`email_messages?gmail_id=eq.${q(gmailId)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ conversation_id: conversationId, updated_at: new Date().toISOString() }),
    }),
    customer ? rememberConversation(conversationId, customer.id, "email") : Promise.resolve(),
    // On the Mood tab at once: ElevenLabs never scores email conversations.
    mood
      ? recordEmailMood({
          conversationId,
          customerId: customer?.id ?? null,
          subject: email.subject,
          text: withoutQuotedHistory(email.text),
          receivedAt: email.receivedAt,
          mood,
        }).catch((error) => console.error("email mood not added to the Mood page", error))
      : Promise.resolve(),
  ]);
}

// --- Clara's answer ----------------------------------------------------------------------------

/** Each item in `data` is `{ type, event }`; an agent_response's text is `event.agent_response`. */
export type ReplyWebhook = {
  conversation_id?: string;
  user_message_ids?: string[];
  status?: string;
  error?: unknown;
  data?: { type?: string; event?: { agent_response?: unknown } }[];
};

/** Everything Clara said in this turn, in order. */
function replyText(payload: ReplyWebhook): string {
  return (payload.data ?? [])
    .filter((item) => item.type === "agent_response")
    .map((item) => item.event?.agent_response)
    .filter((text): text is string => typeof text === "string" && text.trim().length > 0)
    .join("\n\n");
}

async function rowFor(payload: ReplyWebhook): Promise<EmailRow | null> {
  const gmailId = payload.user_message_ids
    ?.find((id) => typeof id === "string" && id.startsWith(MESSAGE_ID_PREFIX))
    ?.slice(MESSAGE_ID_PREFIX.length);
  const filter = gmailId
    ? `gmail_id=eq.${q(gmailId)}`
    : payload.conversation_id
      ? `conversation_id=eq.${q(payload.conversation_id)}`
      : null;
  if (!filter) return null;
  const rows = await rest<EmailRow[]>(`email_messages?${filter}&select=*&limit=1`);
  return rows[0] ?? null;
}

/**
 * One call per turn. Throws when Gmail refuses, so the route answers 500 and ElevenLabs tries
 * again (it retries twice within a few seconds); the row lets a retry pick up a failed send.
 */
export async function handleAssistantReply(payload: ReplyWebhook): Promise<{ outcome: string }> {
  const row = await rowFor(payload);
  if (!row) return { outcome: "not an email we sent to Clara" };

  if (payload.status === "failed") {
    if (await move(row.gmail_id, ["new", "waiting"], { status: "failed", reason: "Clara could not answer" })) {
      await label(row.gmail_id, "failed");
    }
    return { outcome: "failed" };
  }

  const text = plainReply(replyText(payload));
  if (!text) {
    // Not expected: every email turn ends with an answer. Say so loudly instead of waiting forever.
    console.error("assistant-reply: no agent_response text", JSON.stringify(payload).slice(0, 1000));
    if (await move(row.gmail_id, ["new", "waiting"], { status: "failed", reason: "Clara's answer had no text" })) {
      await label(row.gmail_id, "failed");
    }
    return { outcome: "no text in this turn" };
  }

  if (isSkip(text)) {
    if (await move(row.gmail_id, ["new", "waiting"], { status: "skipped", reason: "Clara: not written by a customer" })) {
      await label(row.gmail_id, "skipped");
      // A robot is not a customer: drop the record made for this sender, if that is all it is.
      await forgetRobotSender(row.conversation_id ?? payload.conversation_id ?? null).catch((error) =>
        console.error("Could not forget a robot sender", error),
      );
    }
    return { outcome: "skipped" };
  }

  // The lock for this reply: a repeated delivery finds the row already taken and stops here.
  if (!(await move(row.gmail_id, ["new", "waiting", "failed"], { status: "replying", reason: null }))) {
    return { outcome: "already handled" };
  }

  // An upset customer always gets a person: Clara's answer waits as a draft, whatever the switch says.
  const upset = isUpsetEmail(row.mood_frustration);
  const mode = upset ? "draft" : await getEmailMode();
  const to = row.reply_to ?? row.from_email;
  try {
    if (!to) throw new Error("The email has no address to reply to");
    const raw = buildReply({
      from: `"NDI - New Digital Intelligence" <${mailboxAddress()}>`,
      to,
      subject: replySubject(row.subject ?? ""),
      inReplyTo: row.message_id,
      references: row.references_header,
      text,
      automatic: mode === "auto",
    });
    if (mode === "auto") {
      await sendRaw(raw, row.thread_id);
      await move(row.gmail_id, ["replying"], { status: "sent", mode });
      await label(row.gmail_id, "replied");
    } else {
      const draftId = await createDraft(raw, row.thread_id);
      const reason = upset ? `upset customer${row.mood_reason ? `: ${row.mood_reason}` : ""}`.slice(0, 300) : null;
      await move(row.gmail_id, ["replying"], { status: "draft", mode, reason, draft_id: draftId, assistant_reply: text }).catch((error) => {
        // Before supabase/schema.sql is re-run the comparison columns are missing: the draft itself
        // is still there, so record it without them rather than calling it a failure.
        console.error("could not keep Clara's draft for comparison", error);
        return move(row.gmail_id, ["replying"], { status: "draft", mode, reason });
      });
      await label(row.gmail_id, "draft");
      if (upset) await flagUpset(row);
    }
    return { outcome: mode === "auto" ? "sent" : "draft" };
  } catch (error) {
    await move(row.gmail_id, ["replying"], { status: "failed", reason: "Gmail refused the reply", mode });
    await label(row.gmail_id, "failed");
    throw error;
  }
}

/** An upset customer's email: labelled for staff in Gmail, and staff are emailed. Never fatal. */
async function flagUpset(row: EmailRow) {
  await labelUpset(row.gmail_id).catch((error) => console.error("upset label not added", error));
  const sent = await sendMoodAlert({
    kind: "email",
    fromName: row.from_name,
    fromEmail: row.from_email,
    subject: row.subject,
    when: new Date(row.received_at ?? row.created_at),
    frustration: row.mood_frustration ?? 0,
    reason: row.mood_reason ?? "",
  }).catch((error) => {
    console.error("upset email alert not sent", error);
    return false;
  });
  if (sent && row.conversation_id) {
    await markAlerted(row.conversation_id).catch((error) => console.error("could not mark the email alerted", error));
  }
}

// --- for the staff page ------------------------------------------------------------------------

export async function recentEmails(limit = 8): Promise<EmailRow[]> {
  return rest<EmailRow[]>(
    `email_messages?select=gmail_id,thread_id,from_email,from_name,subject,status,reason,mode,created_at,mood_label,mood_frustration&order=created_at.desc&limit=${limit}`,
  ).catch(() =>
    // Before supabase/schema.sql is re-run there are no mood columns: list the emails without them.
    rest<EmailRow[]>(
      `email_messages?select=gmail_id,thread_id,from_email,from_name,subject,status,reason,mode,created_at&order=created_at.desc&limit=${limit}`,
    ),
  );
}
