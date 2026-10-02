// What the staff admin page shows about customers: who they are, which channels they use, what
// they asked, and short insights written by Claude. Staff only (the routes check the Aida staff
// token). Reads Supabase, and ElevenLabs for recent transcripts; writes nothing.

import { displayCode } from "./aida";
import { askClaude, parseJsonObject } from "./anthropic";
import { elevenLabsConversation } from "./elevenlabs";
import { moodsFor, type ConversationMoodBadge } from "./mood";
import { supabaseRest as rest } from "./supabase";

const q = encodeURIComponent;
const DAY = 86_400_000;
/** Someone whose last conversation started this recently is shown as active now. */
const ACTIVE_NOW_MS = 15 * 60_000;

export type AdminChannel = { channel: string; label: string; verified: boolean };

export type CustomerSummary = {
  id: string;
  name: string | null;
  hasAccount: boolean;
  createdAt: string;
  lastActivity: string;
  activeNow: boolean;
  channels: AdminChannel[];
  notes: number;
  conversations: number;
};

export type Overview = {
  customers: number;
  withAccount: number;
  multiChannel: number;
  active7Days: number;
  activeNow: number;
  /** How many customers can be reached on each kind of channel. */
  channels: Record<string, number>;
  /** Conversations started in the last 7 days, per channel. */
  conversations7Days: Record<string, number>;
  /** What happened to the emails that reached the mailbox since the switch to Gmail. */
  emails: Record<string, number>;
  rooms: { open: number; closed: number };
};

type ChannelRow = { channel: string; channel_key: string; verified: boolean };
type CustomerRow = { id: string; name: string | null; auth_user_id: string | null; created_at: string; customer_channels: ChannelRow[] | null };

/** Website "channels" are browser cookies: meaningless to staff, so they are not shown in full. */
function channelLabel(channel: string, key: string): string {
  if (channel === "website") return `browser ${key.slice(0, 6)}`;
  if (channel === "telegram") return `chat ${key}`;
  if (channel === "instagram" || channel === "messenger") return `id ${key}`;
  if (channel === "alexa") return `Alexa user ${key.slice(0, 6)}`;
  if (channel === "phone") return key;
  return key;
}

const toChannels = (rows: ChannelRow[] | null): AdminChannel[] =>
  (rows ?? []).map((row) => ({ channel: row.channel, label: channelLabel(row.channel, row.channel_key), verified: row.verified }));

const countBy = <T>(items: T[], key: (item: T) => string | null | undefined) =>
  items.reduce<Record<string, number>>((counts, item) => {
    const value = key(item) ?? "unknown";
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});

// --- the list and the overview -----------------------------------------------------------------

export async function customersOverview(): Promise<{ customers: CustomerSummary[]; overview: Overview }> {
  const [customers, notes, conversations, emails, rooms] = await Promise.all([
    rest<CustomerRow[]>("customers?select=id,name,auth_user_id,created_at,customer_channels(channel,channel_key,verified)&order=created_at.desc&limit=1000"),
    rest<{ customer_id: string; created_at: string }[]>("customer_notes?select=customer_id,created_at&order=created_at.desc&limit=10000"),
    rest<{ customer_id: string; channel: string | null; created_at: string }[]>(
      "customer_conversations?select=customer_id,channel,created_at&order=created_at.desc&limit=10000",
    ),
    rest<{ status: string }[]>("email_messages?select=status&limit=10000").catch(() => []),
    rest<{ status: string; expires_at: string }[]>("aida_rooms?select=status,expires_at&limit=10000").catch(() => []),
  ]);

  const now = Date.now();
  const stats = new Map<string, { notes: number; conversations: number; last: string }>();
  const touch = (id: string, at: string, field: "notes" | "conversations") => {
    const entry = stats.get(id) ?? { notes: 0, conversations: 0, last: "" };
    entry[field]++;
    if (at > entry.last) entry.last = at;
    stats.set(id, entry);
  };
  notes.forEach((note) => touch(note.customer_id, note.created_at, "notes"));
  conversations.forEach((conversation) => touch(conversation.customer_id, conversation.created_at, "conversations"));

  const list: CustomerSummary[] = customers
    .map((customer) => {
      const entry = stats.get(customer.id);
      const lastActivity = entry?.last || customer.created_at;
      const lastConversation = conversations.find((conversation) => conversation.customer_id === customer.id)?.created_at;
      return {
        id: customer.id,
        name: customer.name,
        hasAccount: Boolean(customer.auth_user_id),
        createdAt: customer.created_at,
        lastActivity,
        activeNow: Boolean(lastConversation && now - new Date(lastConversation).getTime() < ACTIVE_NOW_MS),
        channels: toChannels(customer.customer_channels),
        notes: entry?.notes ?? 0,
        conversations: entry?.conversations ?? 0,
      };
    })
    .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));

  const weekAgo = now - 7 * DAY;
  const kinds = (customer: CustomerSummary) => new Set(customer.channels.map((channel) => channel.channel));
  const overview: Overview = {
    customers: list.length,
    withAccount: list.filter((customer) => customer.hasAccount).length,
    multiChannel: list.filter((customer) => kinds(customer).size > 1).length,
    active7Days: list.filter((customer) => new Date(customer.lastActivity).getTime() > weekAgo).length,
    activeNow: list.filter((customer) => customer.activeNow).length,
    channels: list.reduce<Record<string, number>>((counts, customer) => {
      for (const kind of kinds(customer)) counts[kind] = (counts[kind] ?? 0) + 1;
      return counts;
    }, {}),
    conversations7Days: countBy(
      conversations.filter((conversation) => new Date(conversation.created_at).getTime() > weekAgo),
      (conversation) => conversation.channel,
    ),
    emails: countBy(emails, (email) => email.status),
    rooms: {
      open: rooms.filter((room) => room.status === "open" && new Date(room.expires_at).getTime() > now).length,
      closed: rooms.filter((room) => room.status !== "open" || new Date(room.expires_at).getTime() <= now).length,
    },
  };
  return { customers: list, overview };
}

// --- one customer --------------------------------------------------------------------------------

export type CustomerDetail = {
  customer: CustomerSummary;
  notes: { summary: string; channel: string | null; createdAt: string }[];
  /** mood: ElevenLabs' measured mood of that conversation (😊 Mood), null when it was not scored. */
  conversations: { id: string; channel: string | null; createdAt: string; mood: ConversationMoodBadge | null }[];
  rooms: { code: string; title: string | null; createdAt: string; closedAt: string | null }[];
  emails: { subject: string | null; status: string; reason: string | null; createdAt: string }[];
};

export async function customerDetail(id: string): Promise<CustomerDetail | null> {
  const [customers, notes, conversations, rooms] = await Promise.all([
    rest<CustomerRow[]>(`customers?id=eq.${q(id)}&select=id,name,auth_user_id,created_at,customer_channels(channel,channel_key,verified)&limit=1`),
    rest<{ summary: string; channel: string | null; created_at: string }[]>(
      `customer_notes?customer_id=eq.${q(id)}&select=summary,channel,created_at&order=created_at.desc&limit=50`,
    ),
    rest<{ conversation_id: string; channel: string | null; created_at: string }[]>(
      `customer_conversations?customer_id=eq.${q(id)}&select=conversation_id,channel,created_at&order=created_at.desc&limit=50`,
    ),
    rest<{ code: string; title: string | null; created_at: string; closed_at: string | null }[]>(
      `aida_rooms?customer_id=eq.${q(id)}&select=code,title,created_at,closed_at&order=created_at.desc&limit=20`,
    ).catch(() => []),
  ]);
  const row = customers[0];
  if (!row) return null;

  const addresses = (row.customer_channels ?? []).filter((channel) => channel.channel === "email").map((channel) => channel.channel_key);
  const emails = addresses.length
    ? await rest<{ subject: string | null; status: string; reason: string | null; created_at: string }[]>(
        `email_messages?from_email=in.(${addresses.map((address) => `"${q(address.replace(/"/g, ""))}"`).join(",")})&select=subject,status,reason,created_at&order=created_at.desc&limit=20`,
      ).catch(() => [])
    : [];

  const moods = await moodsFor(conversations.map((conversation) => conversation.conversation_id));
  const last = [notes[0]?.created_at, conversations[0]?.created_at, row.created_at].filter(Boolean).sort().at(-1) as string;
  return {
    customer: {
      id: row.id,
      name: row.name,
      hasAccount: Boolean(row.auth_user_id),
      createdAt: row.created_at,
      lastActivity: last,
      activeNow: Boolean(conversations[0] && Date.now() - new Date(conversations[0].created_at).getTime() < ACTIVE_NOW_MS),
      channels: toChannels(row.customer_channels),
      notes: notes.length,
      conversations: conversations.length,
    },
    notes: notes.map((note) => ({ summary: note.summary, channel: note.channel, createdAt: note.created_at })),
    conversations: conversations.map((conversation) => ({
      id: conversation.conversation_id,
      channel: conversation.channel,
      createdAt: conversation.created_at,
      mood: moods[conversation.conversation_id] ?? null,
    })),
    rooms: rooms.map((room) => ({ code: displayCode(room.code), title: room.title, createdAt: room.created_at, closedAt: room.closed_at })),
    emails: emails.map((email) => ({ subject: email.subject, status: email.status, reason: email.reason, createdAt: email.created_at })),
  };
}

// --- insights written by Claude --------------------------------------------------------------------

export type CustomerInsight = {
  summary: string;
  topics: string[];
  products: string[];
  sentiment: "positive" | "neutral" | "negative" | "unknown";
  sentimentReason: string;
  openIssues: string[];
  nextAction: string;
  flags: string[];
};

const ANALYST = `You are an analyst for CDA (a UK kitchen appliance brand) customer care.
You write short, factual insights for CDA staff, based only on the data you are given.
Never invent facts, models or dates. If the data is thin, say so. British English. Answer with JSON only.`;

/** A few recent transcripts give Claude more than one-line notes. Free to read from ElevenLabs. */
async function recentTranscripts(conversationIds: string[]): Promise<string[]> {
  const transcripts = await Promise.all(
    conversationIds.slice(0, 3).map(async (id) => {
      try {
        const record = await elevenLabsConversation(id);
        const text = (record.transcript ?? [])
          .filter((turn) => turn.message?.trim())
          .map((turn) => `${turn.role === "agent" ? "Ellie" : "Customer"}: ${turn.message?.trim()}`)
          .join("\n");
        return text ? text.slice(0, 2500) : null;
      } catch {
        return null;
      }
    }),
  );
  return transcripts.filter((text): text is string => Boolean(text));
}

const list = (items: string[]) => (items.length ? items.map((item) => `- ${item}`).join("\n") : "(none)");
const day = (iso: string) => iso.slice(0, 10);
const strings = (value: unknown, max: number) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, max) : [];

export async function customerInsight(detail: CustomerDetail): Promise<CustomerInsight> {
  const { customer } = detail;
  const transcripts = await recentTranscripts(detail.conversations.map((conversation) => conversation.id));
  const prompt = `Customer: ${customer.name ?? "(no name known)"}${customer.hasAccount ? " — has a CDA account on the website" : ""}
First seen ${day(customer.createdAt)}, last activity ${day(customer.lastActivity)}.
Channels: ${customer.channels.map((channel) => `${channel.channel}${channel.verified ? " (verified)" : ""}`).join(", ") || "(none)"}
Conversations: ${detail.conversations.length} (${Object.entries(countBy(detail.conversations, (c) => c.channel)).map(([channel, count]) => `${channel} ${count}`).join(", ") || "none"})

Notes from earlier conversations, newest first (one line each):
${list(detail.notes.slice(0, 30).map((note) => `${day(note.createdAt)} ${note.channel ?? ""}: ${note.summary}`))}

Emails received:
${list(detail.emails.map((email) => `${day(email.createdAt)} "${email.subject ?? ""}" -> ${email.status}${email.reason ? ` (${email.reason})` : ""}`))}

Measured mood of each conversation (ElevenLabs sentiment: score -1 to +1, frustration 0-100%), newest first:
${list(detail.conversations.filter((c) => c.mood).slice(0, 15).map((c) => `${day(c.createdAt)} ${c.channel ?? ""}: ${c.mood!.label}, score ${c.mood!.score.toFixed(1)}, frustration ${Math.round(c.mood!.frustration * 100)}%`))}

Live calls with staff (Aida rooms):
${list(detail.rooms.map((room) => `${day(room.createdAt)} ${room.title ?? "room"}${room.closedAt ? "" : " (still open)"}`))}

Most recent conversation transcripts:
${transcripts.length ? transcripts.map((text, index) => `--- conversation ${index + 1} ---\n${text}`).join("\n") : "(none available)"}

Return this JSON object and nothing else:
{"summary": "2-3 sentences on who this customer is and what they have wanted from CDA",
 "topics": ["up to 5 short topics"],
 "products": ["appliances or model numbers they mentioned, up to 5"],
 "sentiment": "positive | neutral | negative | unknown",
 "sentiment_reason": "one short sentence; base the sentiment on the measured moods when there are any",
 "open_issues": ["things that do not look resolved yet, up to 3"],
 "next_action": "one concrete suggestion for CDA staff",
 "flags": ["only if present: complaint, safety concern, repeated contact, asked for a person, refund or legal"]}`;

  const answer = parseJsonObject<Record<string, unknown>>(await askClaude({ system: ANALYST, prompt }));
  if (!answer) throw new Error("Claude did not return an insight");
  const sentiment = String(answer.sentiment ?? "unknown").toLowerCase();
  return {
    summary: String(answer.summary ?? ""),
    topics: strings(answer.topics, 5),
    products: strings(answer.products, 5),
    sentiment: (["positive", "neutral", "negative"].includes(sentiment) ? sentiment : "unknown") as CustomerInsight["sentiment"],
    sentimentReason: String(answer.sentiment_reason ?? ""),
    openIssues: strings(answer.open_issues, 3),
    nextAction: String(answer.next_action ?? ""),
    flags: strings(answer.flags, 5),
  };
}

export type WeekInsight = { summary: string; topTopics: string[]; commonProblems: string[]; products: string[]; suggestions: string[]; basedOn: number };

/** What customers asked about in the last 7 days, across every channel. */
export async function weekInsight(): Promise<WeekInsight> {
  const since = new Date(Date.now() - 7 * DAY).toISOString();
  const [notes, emails] = await Promise.all([
    rest<{ summary: string; channel: string | null; created_at: string }[]>(
      `customer_notes?created_at=gt.${q(since)}&select=summary,channel,created_at&order=created_at.desc&limit=120`,
    ),
    rest<{ subject: string | null; status: string }[]>(
      `email_messages?created_at=gt.${q(since)}&status=neq.skipped&select=subject,status&order=created_at.desc&limit=60`,
    ).catch(() => []),
  ]);
  if (!notes.length && !emails.length) {
    return { summary: "No conversations were recorded in the last 7 days.", topTopics: [], commonProblems: [], products: [], suggestions: [], basedOn: 0 };
  }

  const prompt = `One line per conversation from the last 7 days (channel: summary):
${list(notes.map((note) => `${note.channel ?? "unknown"}: ${note.summary}`))}

Subjects of customer emails in the same period:
${list(emails.map((email) => email.subject ?? "(no subject)"))}

Return this JSON object and nothing else:
{"summary": "2-3 sentences on what customers contacted CDA about this week",
 "top_topics": ["the most common topics, most frequent first, up to 5"],
 "common_problems": ["faults or frustrations that came up, up to 4"],
 "products": ["appliances or models mentioned most, up to 5"],
 "suggestions": ["up to 3 concrete ideas for CDA, e.g. a knowledge base gap to fill"]}`;

  const answer = parseJsonObject<Record<string, unknown>>(await askClaude({ system: ANALYST, prompt }));
  if (!answer) throw new Error("Claude did not return an insight");
  return {
    summary: String(answer.summary ?? ""),
    topTopics: strings(answer.top_topics, 5),
    commonProblems: strings(answer.common_problems, 4),
    products: strings(answer.products, 5),
    suggestions: strings(answer.suggestions, 3),
    basedOn: notes.length + emails.length,
  };
}
