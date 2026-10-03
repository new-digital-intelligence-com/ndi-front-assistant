// Call lists: staff put phone numbers with instructions on /admin, and Clara phones them one by one
// from the Twilio number. A number is tried up to 3 times, a minute apart, before the list moves on;
// a call that reaches someone counts as done, whatever was said.
//
// Nothing runs in the background. A list moves forward whenever something looks at it: the staff
// page (every few seconds while a list is running) and ElevenLabs' post-call webhook (the moment a
// call ends or fails to connect). Only one call per list is ever in progress, because a list's
// current_item is claimed with a conditional update before a call is placed.
//
// Clara learns why she is calling from customer_lookup, which she calls at the start of every
// conversation anyway: for a call from a list it also returns the staff instructions. No dynamic
// variable is added to her prompt, so no other channel is touched.
//
// A call can also name a colleague to hand over to (src/lib/handover.ts). While the customer is with
// that colleague the line stays busy: the list waits until their call is over too.

import { anthropicConfigured, askClaude } from "./anthropic";
import { findByChannel } from "./customers";
import { supabaseRest as rest } from "./supabase";

export { normalisePhone } from "./phone";

const q = encodeURIComponent;
const API = "https://api.elevenlabs.io/v1/convai";

export const MAX_ATTEMPTS = 3;
export const RETRY_AFTER_MS = 60_000;
export const MAX_CALLS_PER_LIST = 50;
/** A call still "in progress" after this long is treated as over (a missed webhook, a stuck line). */
const STUCK_AFTER_MS = 20 * 60_000;
/** ElevenLabs can take a moment to create the conversation record after the call is placed. */
const RECORD_GRACE_MS = 90_000;
/** A hand-over still going after this long is treated as over (a missed status callback). */
const HANDOVER_STUCK_AFTER_MS = 3 * 3_600_000;

export type ItemStatus = "waiting" | "calling" | "reached" | "failed" | "stopped";

export type CallItem = {
  id: string;
  list_id: string;
  position: number;
  phone: string;
  name: string | null;
  instructions: string;
  status: ItemStatus;
  attempts: number;
  next_attempt_at: string | null;
  conversation_id: string | null;
  last_outcome: string | null;
  summary: string | null;
  started_at: string | null;
  finished_at: string | null;
  call_sid: string | null;
  handover_name: string | null;
  handover_phone: string | null;
  handover_when: string | null;
  handover_status: string | null;
  handover_started_at: string | null;
};

export type CallList = {
  id: string;
  title: string | null;
  created_by: string | null;
  status: "running" | "stopped" | "done";
  current_item: string | null;
  created_at: string;
  finished_at: string | null;
  items?: CallItem[];
};

export type Handover = { name: string | null; phone: string; when: string | null };
export type NewCall = { phone: string; name?: string | null; instructions: string; handover?: Handover | null };

// --- ElevenLabs --------------------------------------------------------------------------------

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key || !process.env.ELEVENLABS_AGENT_ID) throw new Error("ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID must be set");
  return key;
}

let agentNumberId: string | null = null;

/** The Twilio number attached to Clara in ElevenLabs, looked up rather than configured. */
async function agentNumber(): Promise<string> {
  if (agentNumberId) return agentNumberId;
  const response = await fetch(`${API}/phone-numbers`, { headers: { "xi-api-key": apiKey() }, cache: "no-store" });
  if (!response.ok) throw new Error(`ElevenLabs phone numbers failed with ${response.status}`);
  const numbers = (await response.json()) as {
    phone_number_id: string;
    supports_outbound?: boolean;
    assigned_agent?: { agent_id?: string } | null;
  }[];
  const attached = numbers.find(
    (number) => number.assigned_agent?.agent_id === process.env.ELEVENLABS_AGENT_ID && number.supports_outbound !== false,
  );
  if (!attached) throw new Error("No phone number that can call out is attached to Clara in ElevenLabs");
  agentNumberId = attached.phone_number_id;
  return agentNumberId;
}

const REASON_SYSTEM = `You help NDI's virtual assistant open a phone call she makes to a customer.
NDI (New Digital Intelligence) builds and runs AI Employees for organisations.
From the NDI staff notes, write only the words that finish the sentence "I'm calling about ...",
spoken to the customer: at most 8 words, starting in lower case, no full stop, no quotes.
Name the topic only, for example: your demo request for the AI SDR / your enquiry about our AI Employees.
Never include names, phone numbers, prices or dates.`;

/** "your demo request for the AI SDR", from the staff instructions. Null when Claude is slow or unsure. */
async function callReason(instructions: string): Promise<string | null> {
  if (!anthropicConfigured() || !instructions.trim()) return null;
  try {
    const text = await askClaude({ system: REASON_SYSTEM, prompt: instructions, maxTokens: 40, timeoutMs: 5_000 });
    const reason = text.trim().split("\n")[0].replace(/^["'“]|["'”.]+$/g, "").trim();
    return /^[a-z][\w\s'’,-]{2,70}$/i.test(reason) && reason.split(/\s+/).length <= 10 ? reason : null;
  } catch (error) {
    console.error("call reason could not be written", error);
    return null;
  }
}

/**
 * What Clara says as the person picks up (her usual greeting is for people calling NDI): their first
 * name, from the list or else from what NDI already knows about that number, and why she is calling,
 * so nobody hangs up during the moment she takes to look them up.
 */
async function greeting(item: CallItem): Promise<string> {
  const [known, reason] = await Promise.all([
    item.name ? null : findByChannel({ channel: "phone", key: item.phone }).catch(() => null),
    callReason(item.instructions),
  ]);
  const first = (item.name ?? known?.customer.name ?? "").trim().split(/\s+/)[0];
  return `Hello${first ? ` ${first}` : ""}, this is Clara, the virtual assistant from NDI.${reason ? ` I'm calling about ${reason}.` : ""} Have you got a moment?`;
}

function errorText(body: { message?: string; detail?: unknown }, status: number): string {
  const detail = body.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && "message" in detail && typeof detail.message === "string") return detail.message;
  return body.message || `ElevenLabs could not place the call (${status})`;
}

/** Places the call: its conversation id, and Twilio's id of the call. Throws when it could not be placed at all. */
async function placeCall(item: CallItem): Promise<{ conversationId: string; callSid: string | null }> {
  const response = await fetch(`${API}/twilio/outbound-call`, {
    method: "POST",
    headers: { "xi-api-key": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({
      agent_id: process.env.ELEVENLABS_AGENT_ID,
      agent_phone_number_id: await agentNumber(),
      to_number: item.phone,
      conversation_initiation_client_data: {
        conversation_config_override: { agent: { first_message: await greeting(item) } },
      },
    }),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
    conversation_id?: string | null;
    callSid?: string | null;
    detail?: unknown;
  };
  if (!response.ok || !body.success || !body.conversation_id) throw new Error(errorText(body, response.status));
  return { conversationId: body.conversation_id, callSid: body.callSid ?? null };
}

type Outcome = { state: "running" } | { state: "reached"; summary: string | null } | { state: "missed"; why: string };
type Settled = Exclude<Outcome, { state: "running" }>;

type ConversationRecord = {
  status?: string;
  transcript?: { role?: string; message?: string | null; tool_calls?: { tool_name?: string }[] | null }[];
  analysis?: { transcript_summary?: string | null } | null;
};

/** Whether the latest try is still going, reached someone, or did not (no answer, busy, voicemail). */
async function outcomeOf(item: CallItem): Promise<Outcome> {
  const age = Date.now() - (item.started_at ? Date.parse(item.started_at) : 0);
  // Clara handed the customer over to a colleague: her part is over, theirs may not be.
  if (item.handover_status === "ringing" || item.handover_status === "live") {
    const since = Date.parse(item.handover_started_at ?? item.started_at ?? "") || 0;
    if (Date.now() - since < HANDOVER_STUCK_AFTER_MS) return { state: "running" };
  }
  if (!item.conversation_id) {
    return age > RECORD_GRACE_MS ? { state: "missed", why: item.last_outcome ?? "the call could not be placed" } : { state: "running" };
  }

  const response = await fetch(`${API}/conversations/${q(item.conversation_id)}`, {
    headers: { "xi-api-key": apiKey() },
    cache: "no-store",
  });
  if (response.status === 404) {
    return age > RECORD_GRACE_MS ? { state: "missed", why: item.last_outcome ?? "no answer" } : { state: "running" };
  }
  if (!response.ok) throw new Error(`ElevenLabs conversation lookup failed with ${response.status}`);
  const record = (await response.json()) as ConversationRecord;

  if (record.status === "failed") return { state: "missed", why: item.last_outcome ?? "no answer" };
  if (record.status !== "done") {
    return age > STUCK_AFTER_MS ? { state: "missed", why: "the call did not end properly" } : { state: "running" };
  }

  const transcript = record.transcript ?? [];
  const voicemail = transcript.some((turn) => turn.tool_calls?.some((call) => call.tool_name === "voicemail_detection"));
  if (voicemail) return { state: "missed", why: "voicemail" };
  const spoke = transcript.some((turn) => turn.role === "user" && (turn.message ?? "").trim().length > 0);
  if (!spoke) return { state: "missed", why: item.last_outcome ?? "no answer" };
  return { state: "reached", summary: record.analysis?.transcript_summary?.trim() || null };
}

// --- moving a list forward ---------------------------------------------------------------------

/** Records how a try ended. Conditional on "calling", so two requests never count one try twice. */
async function finishAttempt(item: CallItem, outcome: Settled): Promise<void> {
  const now = new Date();
  const update =
    outcome.state === "reached"
      ? { status: "reached", summary: outcome.summary, last_outcome: "reached", finished_at: now.toISOString() }
      : item.attempts >= MAX_ATTEMPTS
        ? { status: "failed", last_outcome: outcome.why, finished_at: now.toISOString() }
        : { status: "waiting", last_outcome: outcome.why, next_attempt_at: new Date(now.getTime() + RETRY_AFTER_MS).toISOString() };
  await rest(`call_list_items?id=eq.${q(item.id)}&status=eq.calling`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify(update),
  });
}

async function releaseLine(listId: string, itemId: string): Promise<void> {
  await rest(`call_lists?id=eq.${q(listId)}&current_item=eq.${q(itemId)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ current_item: null }),
  });
}

/** Calls the next number, if it is its turn. One by one, in order: nothing jumps the queue. */
async function startNext(listId: string): Promise<void> {
  const [next] = await rest<CallItem[]>(
    `call_list_items?list_id=eq.${q(listId)}&status=eq.waiting&order=position.asc&limit=1&select=*`,
  );
  if (!next) {
    await rest(`call_lists?id=eq.${q(listId)}&status=eq.running&current_item=is.null`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ status: "done", finished_at: new Date().toISOString() }),
    });
    return;
  }
  // The first unfinished number waits for its retry; the ones after it wait with it.
  if (next.next_attempt_at && Date.parse(next.next_attempt_at) > Date.now()) return;

  // Claim the line. If another request got here first, that one places the call.
  const claimed = await rest<CallList[]>(`call_lists?id=eq.${q(listId)}&status=eq.running&current_item=is.null`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify({ current_item: next.id }),
  });
  if (!claimed.length) return;

  const calling: CallItem = {
    ...next,
    status: "calling",
    attempts: next.attempts + 1,
    started_at: new Date().toISOString(),
    conversation_id: null,
    next_attempt_at: null,
  };
  await rest(`call_list_items?id=eq.${q(next.id)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({
      status: calling.status,
      attempts: calling.attempts,
      started_at: calling.started_at,
      conversation_id: null,
      call_sid: null,
      next_attempt_at: null,
    }),
  });

  try {
    const placed = await placeCall(calling);
    await rest(`call_list_items?id=eq.${q(next.id)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ conversation_id: placed.conversationId, call_sid: placed.callSid }),
    });
  } catch (error) {
    // Not placed at all (a wrong number, a country Twilio is not allowed to call): one try used up.
    const why = error instanceof Error ? error.message.slice(0, 200) : "the call could not be placed";
    await finishAttempt(calling, { state: "missed", why });
    await releaseLine(listId, next.id);
  }
}

/**
 * Settles the call in progress if it has ended, then starts the next one if the list is still
 * running. A stopped list only lets its last call finish. Safe to call as often as anyone likes.
 */
export async function advance(listId: string): Promise<void> {
  const [list] = await rest<CallList[]>(`call_lists?id=eq.${q(listId)}&select=*`);
  if (!list) return;

  if (list.current_item) {
    const [item] = await rest<CallItem[]>(`call_list_items?id=eq.${q(list.current_item)}&select=*`);
    if (item && item.status === "calling") {
      const outcome = await outcomeOf(item);
      if (outcome.state === "running") return;
      await finishAttempt(item, outcome);
    }
    await releaseLine(list.id, list.current_item);
  }

  if (list.status === "running") await startNext(list.id);
}

/** Every list that is running, or stopped with a call still on the line. */
export async function advanceActiveLists(): Promise<void> {
  const active = await rest<{ id: string }[]>(`call_lists?or=(status.eq.running,current_item.not.is.null)&select=id`);
  for (const { id } of active) {
    await advance(id).catch((error) => console.error("call list could not move on", id, error));
  }
}

// --- what staff do -----------------------------------------------------------------------------

export async function createList(input: { title: string | null; createdBy: string | null; calls: NewCall[] }): Promise<string> {
  const [list] = await rest<CallList[]>("call_lists", {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify({ title: input.title, created_by: input.createdBy }),
  });
  await rest("call_list_items", {
    method: "POST",
    prefer: "return=minimal",
    body: JSON.stringify(
      input.calls.map((call, position) => ({
        list_id: list.id,
        position,
        phone: call.phone,
        name: call.name || null,
        instructions: call.instructions,
        handover_name: call.handover?.name || null,
        handover_phone: call.handover?.phone || null,
        handover_when: call.handover?.when || null,
      })),
    ),
  });
  await advance(list.id);
  return list.id;
}

/** No new calls. A call already ringing or in progress is not cut off; it is simply the last one. */
export async function stopList(listId: string): Promise<void> {
  const now = new Date().toISOString();
  await rest(`call_lists?id=eq.${q(listId)}&status=eq.running`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ status: "stopped", finished_at: now }),
  });
  await rest(`call_list_items?list_id=eq.${q(listId)}&status=eq.waiting`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ status: "stopped", finished_at: now }),
  });
}

export async function recentLists(limit = 6): Promise<CallList[]> {
  const lists = await rest<CallList[]>(`call_lists?select=*,items:call_list_items(*)&order=created_at.desc&limit=${limit}`);
  for (const list of lists) list.items?.sort((a, b) => a.position - b.position);
  return lists;
}

// --- Clara and ElevenLabs' webhook ---------------------------------------------------------------

export type CallBrief = {
  phone: string;
  customer_name: string | null;
  instructions: string;
  /** Set when staff named a colleague Clara may hand the call over to (src/lib/handover.ts). */
  handover: { colleague: string; when: string | null } | null;
  /** For the server only (the live sound, src/lib/incomingCalls.ts): never told to Clara. */
  itemId: string;
  callSid: string | null;
};

/** For customer_lookup: when Clara is on a call from a list, whom she called and why. */
export async function callBrief(conversationId: string): Promise<CallBrief | null> {
  if (!conversationId) return null;
  const [item] = await rest<
    Pick<CallItem, "id" | "phone" | "name" | "instructions" | "handover_name" | "handover_phone" | "handover_when" | "call_sid">[]
  >(
    `call_list_items?conversation_id=eq.${q(conversationId)}&select=id,phone,name,instructions,handover_name,handover_phone,handover_when,call_sid&limit=1`,
  );
  if (!item) return null;
  return {
    phone: item.phone,
    customer_name: item.name,
    instructions: item.instructions,
    handover: item.handover_phone ? { colleague: item.handover_name || "a colleague", when: item.handover_when } : null,
    itemId: item.id,
    callSid: item.call_sid,
  };
}

const FAILURE_WORDS: Record<string, string> = { busy: "busy", "no-answer": "no answer" };

/**
 * ElevenLabs' post-call webhook for a call from a list: it ended, or never connected. The list moves
 * on straight away instead of at the staff page's next look. False when it is not a list call.
 */
export async function callEnded(conversationId: string, failureReason?: string): Promise<boolean> {
  const [item] = await rest<Pick<CallItem, "id" | "list_id">[]>(
    `call_list_items?conversation_id=eq.${q(conversationId)}&select=id,list_id&limit=1`,
  );
  if (!item) return false;
  if (failureReason) {
    await rest(`call_list_items?id=eq.${q(item.id)}&status=eq.calling`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ last_outcome: FAILURE_WORDS[failureReason] ?? "the call did not connect" }),
    });
  }
  await advance(item.list_id);
  return true;
}
