// Calls to NDI: every call Clara answers on NDI's number (supabase/schema.sql, incoming_calls). They show on
// /admin/calls/incoming while they happen, where staff can open one live (src/lib/liveCall.ts), and
// afterwards with ElevenLabs' summary.
//
//   1. Clara's first move on every call is customer_lookup. For a phone call, right after it answers, the
//      call is registered here. A call from a staff call list is followed on the call list already: if a
//      staff page shows it live while it was ringing, its live sound and transcript start now.
//   2. When the customer asks for a person (or Clara judges they need one), Clara hands the call over to
//      the hand-over team (src/lib/handover.ts, src/lib/handoverTeam.ts).
//   3. ElevenLabs' post-call webhook ends Clara's part: the summary is kept, and the call counts as ended
//      unless a colleague has it, in which case it ends with their talk.

import { findByChannel } from "./customers";
import { elevenLabsConversation, type ConversationRecord } from "./elevenlabs";
import { ensureLive } from "./liveCall";
import { normalisePhone } from "./phone";
import { supabaseRest as rest } from "./supabase";

const q = encodeURIComponent;
/** A call still marked live after this long missed its end (a lost webhook or callback). */
const STALE_AFTER_MS = 3 * 3_600_000;

/** A call from a staff call list, as customer_lookup found it. */
export type ListCall = { itemId: string; callSid: string | null };

/** Registers a call to NDI, once. Null when the conversation is not an incoming phone call. */
async function register(conversationId: string, record: ConversationRecord | null): Promise<{ id: string } | null> {
  const call = record?.metadata?.phone_call;
  if (!call || call.direction !== "inbound") return null;
  const phone = normalisePhone(call.external_number);
  const known = phone ? await findByChannel({ channel: "phone", key: phone }).catch(() => null) : null;
  const [created] = await rest<{ id: string }[]>("incoming_calls?on_conflict=conversation_id&select=id", {
    method: "POST",
    prefer: "resolution=ignore-duplicates,return=representation",
    body: JSON.stringify({
      conversation_id: conversationId,
      call_sid: call.call_sid ?? null,
      phone,
      name: known?.customer.name ?? null,
      ndi_number: call.agent_number ?? null,
    }),
  });
  if (created) return created;
  const [existing] = await rest<{ id: string }[]>(`incoming_calls?conversation_id=eq.${q(conversationId)}&select=id&limit=1`);
  return existing ?? null;
}

/**
 * Right after customer_lookup has answered Clara (it must not keep her waiting): a call to NDI is
 * registered; a call-list call that a staff page shows live gets its sound and transcript, now that it
 * has been answered. Never throws.
 */
export async function trackPhoneCall(conversationId: string, listCall: ListCall | null): Promise<void> {
  if (!conversationId) return;
  try {
    if (listCall) {
      // Twilio's id of the call came with placing it; ElevenLabs has it too, should that have failed.
      const callSid = listCall.callSid || (await elevenLabsConversation(conversationId).catch(() => null))?.metadata?.phone_call?.call_sid;
      if (callSid && !listCall.callSid) {
        await rest(`call_list_items?id=eq.${q(listCall.itemId)}`, {
          method: "PATCH",
          prefer: "return=minimal",
          body: JSON.stringify({ call_sid: callSid }),
        });
      }
      await ensureLive({ kind: "list", id: listCall.itemId });
      return;
    }
    await register(conversationId, await elevenLabsConversation(conversationId).catch(() => null));
  } catch (error) {
    console.error("phone call could not be followed", conversationId, error);
  }
}

/** For the hand-over: the call to NDI behind a conversation, registered now if customer_lookup did not. */
export async function ensureIncomingCall(conversationId: string): Promise<{ id: string } | null> {
  const [known] = await rest<{ id: string }[]>(`incoming_calls?conversation_id=eq.${q(conversationId)}&select=id&limit=1`);
  if (known) return known;
  return register(conversationId, await elevenLabsConversation(conversationId).catch(() => null));
}

/** ElevenLabs' post-call webhook: Clara's part of a call to NDI is over. */
export async function incomingCallEnded(conversationId: string, summary?: string | null): Promise<void> {
  const [call] = await rest<{ id: string; handover_status: string | null }[]>(
    `incoming_calls?conversation_id=eq.${q(conversationId)}&select=id,handover_status&limit=1`,
  );
  if (!call) return;
  if (summary) {
    await rest(`incoming_calls?id=eq.${q(call.id)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ summary: summary.slice(0, 2000) }),
    });
  }
  // A colleague who has the call (or is being rung for it) ends it with their talk (src/lib/handover.ts).
  if (call.handover_status !== "ringing" && call.handover_status !== "live") await closeIncomingCall(call.id);
}

/** The call to NDI ends with the customer's call: after a hand-over, when the colleague's talk is over. */
export async function closeIncomingCall(id: string): Promise<void> {
  await rest(`incoming_calls?id=eq.${q(id)}&status=eq.live`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ status: "ended", ended_at: new Date().toISOString() }),
  });
}

// --- for /admin ------------------------------------------------------------------------------------

/** What staff see; Twilio's ids and the colleagues' numbers stay on the server. `lines`: how many transcript lines. */
const VIEW_FIELDS =
  "id,phone,name,status,started_at,ended_at,summary,handover_name,handover_status,handover_started_at," +
  "handover_live_at,handover_ended_at,handover_note,lines:handover_lines(count)";

export type IncomingCallView = {
  id: string;
  phone: string | null;
  name: string | null;
  status: "live" | "ended";
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  handover_name: string | null;
  handover_status: string | null;
  handover_started_at: string | null;
  handover_live_at: string | null;
  handover_ended_at: string | null;
  handover_note: string | null;
  lines: { count: number }[];
};

/** The calls happening now, and the last twenty. */
export async function incomingOverview(): Promise<{ live: IncomingCallView[]; recent: IncomingCallView[] }> {
  const stale = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  await rest(`incoming_calls?status=eq.live&started_at=lt.${q(stale)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ status: "ended", ended_at: new Date().toISOString() }),
  }).catch((error) => console.error("old calls to NDI could not be closed", error));
  const rows = await rest<IncomingCallView[]>(`incoming_calls?select=${VIEW_FIELDS}&order=started_at.desc&limit=40`);
  return { live: rows.filter((row) => row.status === "live"), recent: rows.filter((row) => row.status !== "live").slice(0, 20) };
}
