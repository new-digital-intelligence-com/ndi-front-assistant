// Customer mood (sentiment) across every channel.
//
// ElevenLabs scores each of Clara's voice and website conversations once it ends: a label, a
// sentiment score from -1 (very negative) to +1, and a frustration score from 0 to 1, overall and for
// every customer message. It never scores Custom Channel conversations (email, Instagram,
// Messenger), so Claude rates those the same way, message by message. The post-call webhook stores them
// here (conversation_moods) and emails staff when a customer was upset or was promised a follow-up.
// /admin → 😊 Mood reads them back.
//
// Emails and Aida rooms are checked earlier, while there is still time to act: Claude rates the
// incoming email before Clara answers it, and each customer line in an Aida room as it is said.

import { anthropicConfigured, askClaude, parseJsonObject } from "./anthropic";
import { conversationChannel, customerForConversation } from "./customers";
import { elevenLabsGet } from "./elevenlabs";
import { mailboxAddress } from "./gmail";
import { sendMoodAlert } from "./moodAlert";
import { embedded, supabaseRest as rest } from "./supabase";

export type MoodLabel = "positive" | "neutral" | "negative";

/** A conversation counts as unhappy from here on: it is listed on /admin and staff are emailed. */
const UPSET_FRUSTRATION = 0.6;
const UPSET_SCORE = -0.5;
const UPSET_PEAK_FRUSTRATION = 0.7;
/** Old conversations (imported, or a webhook retried much later) are stored but never alerted on. */
const ALERT_MAX_AGE_MS = 2 * 3_600_000;
const EXCERPT_LENGTH = 160;

const q = encodeURIComponent;

/** An email is upset from this frustration on: it is never answered automatically. */
export const isUpsetEmail = (frustration: number | null | undefined) => (frustration ?? 0) >= UPSET_FRUSTRATION;

export function isUpset(mood: { score: number; frustration: number; maxFrustration?: number | null }): boolean {
  return (
    mood.frustration >= UPSET_FRUSTRATION ||
    mood.score <= UPSET_SCORE ||
    (mood.maxFrustration ?? 0) >= UPSET_PEAK_FRUSTRATION
  );
}

// --- what ElevenLabs gives us --------------------------------------------------------------------

type SentimentSummary = {
  overall_label?: string | null;
  overall_sentiment_score?: number | null;
  overall_frustration_score?: number | null;
  min_user_sentiment_score?: number | null;
  max_user_frustration_score?: number | null;
  num_scored_user_turns?: number | null;
};

/** The parts of a conversation (webhook body or API record, which are the same shape) used here. */
export type ConversationForMood = {
  conversation_id?: string;
  agent_id?: string;
  conversation_initiation_source?: string | null;
  metadata?: {
    start_time_unix_secs?: number;
    phone_call?: unknown;
    conversation_initiation_source?: string | null;
    /** A Custom Channel conversation: external_id is the channel's trigger id. */
    async_metadata?: { external_id?: string | null } | null;
    /** "public": started without a signed link, e.g. ElevenLabs' own talk-to page or its QR code. */
    authorization_method?: string | null;
  } | null;
  analysis?: {
    sentiment_analysis?: SentimentSummary | null;
    transcript_summary?: string | null;
    call_summary_title?: string | null;
    data_collection_results?: Record<string, { value?: unknown } | undefined> | null;
  } | null;
  transcript?: {
    role?: string;
    message?: string | null;
    time_in_call_secs?: number;
    analysis?: { user_sentiment_score?: number | null; user_frustration_score?: number | null } | null;
  }[];
};

export type MoodTurn = { at: number; excerpt: string; score: number; frustration: number };

type MoodRow = {
  conversation_id: string;
  label: MoodLabel;
  score: number;
  frustration: number;
  min_score: number | null;
  max_frustration: number | null;
  turns: MoodTurn[];
  low_point: string | null;
  title: string | null;
  summary: string | null;
  follow_up: boolean;
  started_at: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

function label(value: unknown, score: number): MoodLabel {
  if (value === "positive" || value === "neutral" || value === "negative") return value;
  return score > 0.2 ? "positive" : score < -0.2 ? "negative" : "neutral";
}

/**
 * What the customer wrote, without what the web app put around it for Clara: the email header
 * ("[Email to NDI]", From, Subject).
 */
function customerWords(text: string | null | undefined): string {
  let clean = (text ?? "").trim();
  if (clean.startsWith("[Email to NDI]")) {
    clean = clean.replace(/^\[Email to NDI\]\s*/, "").replace(/^(From|Subject):[^\n]*\n?/gim, "");
  }
  return clean.trim();
}

function excerpt(text: string | null | undefined): string {
  const clean = customerWords(text).replace(/\s+/g, " ").trim();
  return clean.length > EXCERPT_LENGTH ? `${clean.slice(0, EXCERPT_LENGTH - 1)}…` : clean;
}

/** True when Clara promised that the NDI team will come back to them, or they asked for a person. */
function followUpAsked(results: Record<string, { value?: unknown } | undefined> | null | undefined): boolean {
  const value = results?.needs_follow_up?.value;
  return value === true || (typeof value === "string" && /^(true|yes)$/i.test(value.trim()));
}

/** The mood of one conversation, or null when ElevenLabs scored nothing (no customer message). */
export function moodFromConversation(record: ConversationForMood): MoodRow | null {
  const summary = record.analysis?.sentiment_analysis;
  const conversationId = record.conversation_id;
  const overall = num(summary?.overall_sentiment_score);
  if (!conversationId || !summary || overall === null || !summary.num_scored_user_turns) return null;

  const turns: MoodTurn[] = (record.transcript ?? [])
    .filter((turn) => turn.role === "user" && num(turn.analysis?.user_sentiment_score) !== null)
    .map((turn) => ({
      at: Math.round(turn.time_in_call_secs ?? 0),
      excerpt: excerpt(turn.message),
      score: clamp(num(turn.analysis?.user_sentiment_score) ?? 0, -1, 1),
      frustration: clamp(num(turn.analysis?.user_frustration_score) ?? 0, 0, 1),
    }));
  // The message where the customer was least happy (the most frustrated one breaks a tie).
  const low = [...turns].sort((a, b) => a.score - b.score || b.frustration - a.frustration)[0];
  const score = clamp(overall, -1, 1);
  const startedAt = record.metadata?.start_time_unix_secs;

  return {
    conversation_id: conversationId,
    label: label(summary.overall_label, score),
    score,
    frustration: clamp(num(summary.overall_frustration_score) ?? 0, 0, 1),
    min_score: num(summary.min_user_sentiment_score),
    max_frustration: num(summary.max_user_frustration_score),
    turns,
    low_point: low && low.score < 0 ? low.excerpt : null,
    title: record.analysis?.call_summary_title?.trim() || null,
    summary: record.analysis?.transcript_summary?.trim() || null,
    follow_up: followUpAsked(record.analysis?.data_collection_results),
    started_at: new Date(startedAt ? startedAt * 1000 : Date.now()).toISOString(),
  };
}

/** Each Custom Channel's trigger id is in its inbound URL; a conversation carries the same id. */
const TRIGGER_CHANNELS: [string, string | undefined][] = [
  ["email", process.env.EMAIL_CHANNEL_INBOUND_URL],
  ["instagram", process.env.INSTAGRAM_CHANNEL_INBOUND_URL],
  ["messenger", process.env.MESSENGER_CHANNEL_INBOUND_URL],
];

function channelOfTrigger(triggerId: string | null | undefined): string | null {
  if (!triggerId) return null;
  return TRIGGER_CHANNELS.find(([, url]) => url?.includes(triggerId))?.[0] ?? null;
}

/**
 * Which channel a conversation came from. A known customer's conversation says it directly; for
 * anyone else ElevenLabs' own start source tells the phone and the website apart, and a Custom
 * Channel's trigger id tells email, Instagram and Messenger apart.
 */
async function channelOf(record: ConversationForMood, conversationId: string): Promise<string | null> {
  const isPhone = Boolean(record.metadata?.phone_call);
  const known = await conversationChannel(conversationId, isPhone).catch(() => null);
  if (known) return known;
  const source = record.conversation_initiation_source ?? record.metadata?.conversation_initiation_source ?? "";
  if (/_ic_\d+$/.test(conversationId) || /intercom/i.test(source)) return "intercom";
  if (/telegram/i.test(source)) return "telegram";
  if (/twilio|sip|phone/i.test(source)) return "phone";
  // react_sdk / js_sdk: chat and voice on the site, the widget and the hosted page; python_sdk: the
  // video avatar (Anam's servers connect to Clara on the customer's behalf).
  if (/react|js_sdk|widget|web|python_sdk/i.test(source)) return "website";
  if (/custom_channel/i.test(source)) {
    const byTrigger = channelOfTrigger(record.metadata?.async_metadata?.external_id);
    if (byTrigger) return byTrigger;
    const emails = await rest<{ gmail_id: string }[]>(
      `email_messages?conversation_id=eq.${q(conversationId)}&select=gmail_id&limit=1`,
    ).catch(() => []);
    return emails.length ? "email" : "messaging";
  }
  // ElevenLabs' own talk-to page and its QR code: no source, started without a signed link.
  if ((!source || source === "unknown") && record.metadata?.authorization_method === "public") return "hosted";
  return null;
}

const RATE_CONVERSATION = `You rate how a customer felt in a conversation with Clara, the virtual assistant of NDI (New Digital Intelligence), a company that builds and runs AI Employees for organisations.
You get the customer's messages only, numbered, in order. Answer with JSON only:
{"messages":[{"score":<-1 to 1>,"frustration":<0 to 1>}, one per message in the same order],
 "overall":{"label":"positive|neutral|negative","score":<-1 to 1>,"frustration":<0 to 1>},
 "title":"<3 to 6 words>","summary":"<one short sentence in English: what the customer wanted>"}
- score: -1 very unhappy or angry, 0 neutral, +1 very happy or grateful.
- frustration: 0 calm, 1 furious. Count anger, impatience, distress, threats to complain or leave, repeated chasing, sarcasm.
- A plain question or request, however urgent the problem, is neutral: score near 0, frustration at most 0.2.
- Messages can be in any language, and an email may start with a small header (From, Subject). Rate the customer, not the problem they describe.`;

const MAX_RATED_MESSAGES = 20;

/**
 * Claude's rating of a conversation ElevenLabs did not score (every Custom Channel: email, Instagram,
 * Messenger), in the same shape as ElevenLabs' own. Null without customer messages or Claude.
 */
async function moodFromClaude(record: ConversationForMood): Promise<MoodRow | null> {
  const conversationId = record.conversation_id;
  const messages = (record.transcript ?? [])
    .filter((turn) => turn.role === "user" && turn.message?.trim())
    .slice(0, MAX_RATED_MESSAGES);
  if (!conversationId || !messages.length || !anthropicConfigured()) return null;

  type Answer = {
    messages?: { score?: unknown; frustration?: unknown }[];
    overall?: { label?: unknown; score?: unknown; frustration?: unknown };
    title?: unknown;
    summary?: unknown;
  };
  let answer: Answer | null = null;
  try {
    answer = parseJsonObject<Answer>(
      await askClaude({
        system: RATE_CONVERSATION,
        prompt: messages.map((turn, index) => `${index + 1}. ${turn.message!.trim().slice(0, 800)}`).join("\n\n"),
        maxTokens: 700,
        timeoutMs: 20_000,
      }),
    );
  } catch (error) {
    console.error("Claude could not rate the conversation", conversationId, error);
    return null;
  }
  if (!answer?.overall) return null;

  const turns: MoodTurn[] = messages.map((turn, index) => ({
    at: Math.round(turn.time_in_call_secs ?? 0),
    excerpt: excerpt(turn.message),
    score: clamp(num(answer!.messages?.[index]?.score) ?? 0, -1, 1),
    frustration: clamp(num(answer!.messages?.[index]?.frustration) ?? 0, 0, 1),
  }));
  const score = clamp(num(answer.overall.score) ?? 0, -1, 1);
  const low = [...turns].sort((a, b) => a.score - b.score || b.frustration - a.frustration)[0];
  const startedAt = record.metadata?.start_time_unix_secs;
  return {
    conversation_id: conversationId,
    label: label(answer.overall.label, score),
    score,
    frustration: clamp(num(answer.overall.frustration) ?? 0, 0, 1),
    min_score: turns.length ? Math.min(...turns.map((turn) => turn.score)) : null,
    max_frustration: turns.length ? Math.max(...turns.map((turn) => turn.frustration)) : null,
    turns,
    low_point: low && low.score < 0 ? low.excerpt : null,
    title: record.analysis?.call_summary_title?.trim() || (typeof answer.title === "string" ? answer.title.slice(0, 80) : null),
    summary: record.analysis?.transcript_summary?.trim() || (typeof answer.summary === "string" ? answer.summary.slice(0, 400) : null),
    follow_up: followUpAsked(record.analysis?.data_collection_results),
    started_at: new Date(startedAt ? startedAt * 1000 : Date.now()).toISOString(),
  };
}

async function storedMoodExists(conversationId: string): Promise<boolean> {
  const rows = await rest<{ conversation_id: string }[]>(
    `conversation_moods?conversation_id=eq.${q(conversationId)}&select=conversation_id&limit=1`,
  ).catch(() => []);
  return rows.length > 0;
}

/**
 * Stores the mood of one conversation of Clara's: ElevenLabs' scores, or Claude's rating when
 * ElevenLabs gave none. With `alert`, staff are emailed (once) when the customer was upset or was
 * promised a follow-up. Returns the stored mood, or null if there was none.
 */
export async function recordConversationMood(record: ConversationForMood, { alert }: { alert: boolean }) {
  const mainAgent = process.env.ELEVENLABS_AGENT_ID;
  if (record.agent_id && mainAgent && record.agent_id !== mainAgent) return null; // not one of Clara's conversations
  let mood = moodFromConversation(record);
  if (!mood && record.conversation_id) {
    // An email already has Claude's rating from when it arrived: never rate it twice.
    if (await storedMoodExists(record.conversation_id)) return null;
    mood = await moodFromClaude(record);
  }
  if (!mood) return null;

  const [customer, channel] = await Promise.all([
    customerForConversation(mood.conversation_id).catch(() => null),
    channelOf(record, mood.conversation_id),
  ]);
  // Only the scores are written again on a repeat; when staff were alerted or handled it is kept.
  await rest("conversation_moods?on_conflict=conversation_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify({ ...mood, customer_id: customer?.id ?? null, channel }),
  });

  const worthAlert = isUpset({ score: mood.score, frustration: mood.frustration, maxFrustration: mood.max_frustration }) || mood.follow_up;
  const recent = Date.now() - new Date(mood.started_at).getTime() < ALERT_MAX_AGE_MS;
  // An upset email alerts staff from the email flow, with the email's own details (src/lib/emailInbox.ts).
  if (alert && worthAlert && recent && channel !== "email") {
    await alertOnce(mood.conversation_id, async () =>
      sendMoodAlert({
        kind: "conversation",
        channel,
        customerName: customer?.name ?? null,
        when: new Date(mood.started_at),
        label: mood.label,
        score: mood.score,
        frustration: Math.max(mood.frustration, mood.max_frustration ?? 0),
        lowPoint: mood.low_point,
        title: mood.title,
        summary: mood.summary,
        followUp: mood.follow_up,
      }),
    );
  }
  return { ...mood, channel, customerId: customer?.id ?? null };
}

/** Claims the alert first (alerted_at was empty), so two deliveries of one webhook email staff once. */
async function alertOnce(conversationId: string, send: () => Promise<boolean>) {
  const claimed = await rest<{ conversation_id: string }[]>(
    `conversation_moods?conversation_id=eq.${q(conversationId)}&alerted_at=is.null`,
    { method: "PATCH", prefer: "return=representation", body: JSON.stringify({ alerted_at: new Date().toISOString() }) },
  );
  if (!claimed.length) return;
  const sent = await send().catch((error) => {
    console.error("mood alert could not be sent", error);
    return false;
  });
  // Nobody was emailed (no STAFF_ALERT_EMAIL, or the mail failed): the conversation still waits on /admin.
  if (!sent) {
    await rest(`conversation_moods?conversation_id=eq.${q(conversationId)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ alerted_at: null }),
    });
  }
}

/**
 * An email's mood, from Claude's rating when it arrived: stored at once, so an upset email is on the
 * Mood tab straight away (ElevenLabs never scores email conversations).
 */
export async function recordEmailMood(input: {
  conversationId: string;
  customerId: string | null;
  subject: string;
  text: string;
  receivedAt: Date;
  mood: QuickMood;
}) {
  const turn: MoodTurn = { at: 0, excerpt: excerpt(input.text), score: input.mood.score, frustration: input.mood.frustration };
  await rest("conversation_moods?on_conflict=conversation_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify({
      conversation_id: input.conversationId,
      customer_id: input.customerId,
      channel: "email",
      label: input.mood.label,
      score: input.mood.score,
      frustration: input.mood.frustration,
      min_score: input.mood.score,
      max_frustration: input.mood.frustration,
      turns: [turn],
      low_point: input.mood.score < 0 ? turn.excerpt : null,
      title: input.subject.slice(0, 120) || "(no subject)",
      summary: input.mood.reason || null,
      follow_up: false,
      started_at: input.receivedAt.toISOString(),
    }),
  });
}

/** Staff were emailed about this conversation (shown as "Staff emailed" on the Mood tab). */
export async function markAlerted(conversationId: string) {
  await rest(`conversation_moods?conversation_id=eq.${q(conversationId)}&alerted_at=is.null`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ alerted_at: new Date().toISOString() }),
  });
}

// --- filling in what the webhook missed ------------------------------------------------------------

type ListedConversation = { conversation_id: string; status?: string; start_time_unix_secs?: number };

/**
 * Reads Clara's recent conversations from ElevenLabs (free) and stores the mood of any that are not
 * here yet, without alerting anyone. Used by the "Import" button on /admin and by the daily cron.
 */
export async function importMoods({ days = 30, max = 150 }: { days?: number; max?: number } = {}) {
  const since = Math.floor(Date.now() / 1000) - days * 86_400;
  const listed: ListedConversation[] = [];
  let cursor: string | null = null;
  while (listed.length < max) {
    const page: { conversations: ListedConversation[]; next_cursor?: string | null; has_more?: boolean } =
      await elevenLabsGet("/conversations", {
        page_size: "100",
        call_start_after_unix: String(since),
        ...(cursor ? { cursor } : {}),
      });
    listed.push(...page.conversations.filter((c) => c.status === "done"));
    cursor = page.next_cursor ?? null;
    if (!page.has_more || !cursor) break;
  }
  const candidates = listed.slice(0, max);
  if (!candidates.length) return { checked: 0, added: 0 };

  const have = new Set<string>();
  for (let i = 0; i < candidates.length; i += 50) {
    const ids = candidates.slice(i, i + 50).map((c) => `"${c.conversation_id}"`).join(",");
    const rows = await rest<{ conversation_id: string; channel: string | null }[]>(
      `conversation_moods?conversation_id=in.(${q(ids)})&select=conversation_id,channel`,
    );
    // A row stored without a channel is done again, so it gets one (the scores are simply rewritten).
    rows.filter((row) => row.channel).forEach((row) => have.add(row.conversation_id));
  }
  const missing = candidates.filter((c) => !have.has(c.conversation_id));

  let added = 0;
  // A few at a time: each is one free read of the full conversation.
  for (let i = 0; i < missing.length; i += 5) {
    const results = await Promise.all(
      missing.slice(i, i + 5).map(async ({ conversation_id }) => {
        try {
          const record = await elevenLabsGet<ConversationForMood>(`/conversations/${q(conversation_id)}`);
          return (await recordConversationMood(record, { alert: false })) ? 1 : 0;
        } catch (error) {
          console.error("mood import failed for", conversation_id, error);
          return 0;
        }
      }),
    );
    added += results.reduce<number>((sum, n) => sum + n, 0);
  }
  return { checked: candidates.length, added };
}

// --- Claude's quick rating, for emails and Aida rooms ------------------------------------------------

export type QuickMood = { label: MoodLabel; score: number; frustration: number; reason: string };

const RATER = `You rate the mood of one message a customer sent to NDI (New Digital Intelligence, a company that builds and runs AI Employees for organisations), for the NDI team.
Answer with JSON only: {"label":"positive|neutral|negative","score":<-1 to 1>,"frustration":<0 to 1>,"reason":"<at most 12 words, English>"}
- score: -1 very unhappy or angry, 0 neutral, +1 very happy or grateful.
- frustration: 0 calm, 1 furious. Count anger, impatience, distress, threats to complain or leave, repeated chasing, sarcasm.
- A plain question or request, however urgent the problem, is neutral: score near 0, frustration at most 0.2.
- The message can be in any language. Rate the customer, not the problem they describe: "our AI Employee stopped answering" alone is neutral.`;

/** Claude's rating of one customer message, or null when Claude is not configured or does not answer in time. */
export async function rateMessage(text: string, { timeoutMs }: { timeoutMs: number }): Promise<QuickMood | null> {
  const clean = text.trim().slice(0, 3000);
  if (!clean || !anthropicConfigured()) return null;
  try {
    const answer = parseJsonObject<{ label?: unknown; score?: unknown; frustration?: unknown; reason?: unknown }>(
      await askClaude({ system: RATER, prompt: clean, maxTokens: 120, timeoutMs }),
    );
    if (!answer) return null;
    const score = clamp(num(answer.score) ?? 0, -1, 1);
    return {
      label: label(answer.label, score),
      score,
      frustration: clamp(num(answer.frustration) ?? 0, 0, 1),
      reason: typeof answer.reason === "string" ? answer.reason.slice(0, 160) : "",
    };
  } catch (error) {
    console.error("mood rating failed", error);
    return null;
  }
}

// --- for /admin → 😊 Mood --------------------------------------------------------------------------

type StoredMood = {
  conversation_id: string;
  customer_id: string | null;
  channel: string | null;
  label: MoodLabel;
  score: number;
  frustration: number;
  max_frustration: number | null;
  turns: MoodTurn[];
  low_point: string | null;
  title: string | null;
  summary: string | null;
  follow_up: boolean;
  started_at: string;
  alerted_at: string | null;
  handled_at: string | null;
  handled_by: string | null;
  customers?: { name: string | null } | { name: string | null }[] | null;
};

export type MoodCounts = { total: number; positive: number; neutral: number; negative: number };

export type UnhappyConversation = {
  conversationId: string;
  channel: string;
  customerId: string | null;
  customerName: string | null;
  startedAt: string;
  label: MoodLabel;
  score: number;
  frustration: number;
  peakFrustration: number;
  lowPoint: string | null;
  title: string | null;
  summary: string | null;
  followUp: boolean;
  alerted: boolean;
  handledAt: string | null;
  handledBy: string | null;
  turns: MoodTurn[];
};

export type MoodOverview = {
  days: number;
  counts: MoodCounts;
  averageScore: number | null;
  averageFrustration: number | null;
  byChannel: (MoodCounts & { channel: string; averageFrustration: number })[];
  byDay: (MoodCounts & { date: string })[];
  unhappy: UnhappyConversation[];
  emails: { checked: number; upset: number; mailbox: string | null; items: UpsetEmail[] };
  aida: { lines: number; frustrated: number; items: FrustratedLine[] };
};

export type UpsetEmail = {
  threadId: string;
  from: string | null;
  subject: string | null;
  reason: string | null;
  frustration: number;
  status: string;
  receivedAt: string;
};

export type FrustratedLine = {
  roomCode: string | null;
  roomTitle: string | null;
  excerpt: string | null;
  label: MoodLabel;
  frustration: number;
  at: string;
};

const emptyCounts = (): MoodCounts => ({ total: 0, positive: 0, neutral: 0, negative: 0 });
/** Every channel of the demo is always listed, even in a period without conversations on it. */
const DEMO_CHANNELS = ["website", "phone", "email", "telegram", "instagram", "messenger", "intercom", "hosted"];
const add = (counts: MoodCounts, moodLabel: MoodLabel) => {
  counts.total += 1;
  counts[moodLabel] += 1;
};
const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const NDI_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" });

export async function moodOverview(days: number): Promise<MoodOverview> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [rows, emails, aidaLines] = await Promise.all([
    rest<StoredMood[]>(
      `conversation_moods?started_at=gte.${q(since)}&select=*,customers(name)&order=started_at.desc&limit=5000`,
    ),
    rest<
      {
        thread_id: string;
        from_name: string | null;
        from_email: string | null;
        subject: string | null;
        status: string;
        mood_label: string | null;
        mood_frustration: number | null;
        mood_reason: string | null;
        created_at: string;
      }[]
    >(
      `email_messages?created_at=gte.${q(since)}&mood_label=not.is.null&select=thread_id,from_name,from_email,subject,status,mood_label,mood_frustration,mood_reason,created_at&order=created_at.desc&limit=5000`,
    ).catch(() => []),
    rest<
      {
        frustration: number;
        score: number;
        label: MoodLabel;
        excerpt: string | null;
        created_at: string;
        aida_rooms?: { code: string; title: string | null } | { code: string; title: string | null }[] | null;
      }[]
    >(
      `aida_moods?created_at=gte.${q(since)}&select=frustration,score,label,excerpt,created_at,aida_rooms(code,title)&order=created_at.desc&limit=5000`,
    ).catch(() => []),
  ]);

  const counts = emptyCounts();
  const channels = new Map<string, MoodCounts & { frustrations: number[] }>(
    DEMO_CHANNELS.map((channel) => [channel, { ...emptyCounts(), frustrations: [] }]),
  );
  const dayKeys: string[] = [];
  for (let i = days - 1; i >= 0; i--) dayKeys.push(NDI_DAY.format(new Date(Date.now() - i * 86_400_000)));
  const byDay = new Map(dayKeys.map((date) => [date, emptyCounts()]));

  for (const row of rows) {
    add(counts, row.label);
    const channel = row.channel ?? "unknown";
    const entry = channels.get(channel) ?? { ...emptyCounts(), frustrations: [] };
    add(entry, row.label);
    entry.frustrations.push(row.frustration);
    channels.set(channel, entry);
    const day = byDay.get(NDI_DAY.format(new Date(row.started_at)));
    if (day) add(day, row.label);
  }

  const unhappy = rows
    .filter((row) => row.follow_up || isUpset({ score: row.score, frustration: row.frustration, maxFrustration: row.max_frustration }))
    .slice(0, 40)
    .map((row) => ({
      conversationId: row.conversation_id,
      channel: row.channel ?? "unknown",
      customerId: row.customer_id,
      customerName: embedded(row.customers)?.name ?? null,
      startedAt: row.started_at,
      label: row.label,
      score: row.score,
      frustration: row.frustration,
      peakFrustration: Math.max(row.frustration, row.max_frustration ?? 0),
      lowPoint: row.low_point,
      title: row.title,
      summary: row.summary,
      followUp: row.follow_up,
      alerted: Boolean(row.alerted_at),
      handledAt: row.handled_at,
      handledBy: row.handled_by,
      turns: Array.isArray(row.turns) ? row.turns : [],
    }));

  return {
    days,
    counts,
    averageScore: average(rows.map((row) => row.score)),
    averageFrustration: average(rows.map((row) => row.frustration)),
    byChannel: [...channels.entries()]
      .map(([channel, entry]) => ({
        channel,
        total: entry.total,
        positive: entry.positive,
        neutral: entry.neutral,
        negative: entry.negative,
        averageFrustration: average(entry.frustrations) ?? 0,
      }))
      // Busiest first; channels without conversations keep the demo's order at the bottom.
      .sort((a, b) => b.total - a.total || DEMO_CHANNELS.indexOf(a.channel) - DEMO_CHANNELS.indexOf(b.channel)),
    byDay: dayKeys.map((date) => ({ date, ...byDay.get(date)! })),
    unhappy,
    emails: {
      checked: emails.length,
      upset: emails.filter((email) => isUpsetEmail(email.mood_frustration)).length,
      mailbox: mailboxAddress(),
      items: emails
        .filter((email) => isUpsetEmail(email.mood_frustration))
        .slice(0, 15)
        .map((email) => ({
          threadId: email.thread_id,
          from: email.from_name || email.from_email,
          subject: email.subject,
          reason: email.mood_reason,
          frustration: email.mood_frustration ?? 0,
          status: email.status,
          receivedAt: email.created_at,
        })),
    },
    aida: {
      lines: aidaLines.length,
      frustrated: aidaLines.filter((line) => line.frustration >= UPSET_FRUSTRATION || line.score <= UPSET_SCORE).length,
      items: aidaLines
        .filter((line) => line.frustration >= UPSET_FRUSTRATION || line.score <= UPSET_SCORE)
        .slice(0, 15)
        .map((line) => {
          const room = embedded(line.aida_rooms);
          return {
            roomCode: room ? `${room.code.slice(0, 3)}-${room.code.slice(3)}` : null,
            roomTitle: room?.title ?? null,
            excerpt: line.excerpt,
            label: line.label,
            frustration: line.frustration,
            at: line.created_at,
          };
        }),
    },
  };
}

/** Staff followed up with the customer: the conversation stays listed, marked handled. */
export async function markHandled(conversationId: string, by: string | null, handled: boolean) {
  await rest(`conversation_moods?conversation_id=eq.${q(conversationId)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify(handled ? { handled_at: new Date().toISOString(), handled_by: by } : { handled_at: null, handled_by: null }),
  });
}

export type ConversationMoodBadge = { label: MoodLabel; score: number; frustration: number; upset: boolean };

/** The mood of each of these conversations, for the customer page. Missing ones were not scored. */
export async function moodsFor(conversationIds: string[]): Promise<Record<string, ConversationMoodBadge>> {
  if (!conversationIds.length) return {};
  const ids = conversationIds.map((id) => `"${id}"`).join(",");
  const rows = await rest<StoredMood[]>(
    `conversation_moods?conversation_id=in.(${q(ids)})&select=conversation_id,label,score,frustration,max_frustration`,
  ).catch(() => []);
  return Object.fromEntries(
    rows.map((row) => [
      row.conversation_id,
      {
        label: row.label,
        score: row.score,
        frustration: row.frustration,
        upset: isUpset({ score: row.score, frustration: row.frustration, maxFrustration: row.max_frustration }),
      },
    ]),
  );
}

/** Keeps the mood of one customer line in an Aida room (staff only). Never fatal for the room. */
export async function recordAidaMood(roomId: string, lineId: string, text: string, mood: QuickMood) {
  await rest("aida_moods?on_conflict=room_id,line_id", {
    method: "POST",
    prefer: "resolution=ignore-duplicates,return=minimal",
    body: JSON.stringify({
      room_id: roomId,
      line_id: lineId,
      excerpt: excerpt(text),
      label: mood.label,
      score: mood.score,
      frustration: mood.frustration,
    }),
  }).catch((error) => console.error("Aida mood not stored", error));
}

/** Every rated customer line of a room, by line id, for staff who join late. */
export async function aidaMoods(roomId: string): Promise<Record<string, { label: MoodLabel; score: number; frustration: number }>> {
  const rows = await rest<{ line_id: string; label: MoodLabel; score: number; frustration: number }[]>(
    `aida_moods?room_id=eq.${q(roomId)}&select=line_id,label,score,frustration&limit=500`,
  ).catch(() => []);
  return Object.fromEntries(rows.map((row) => [row.line_id, { label: row.label, score: row.score, frustration: row.frustration }]));
}
