// Instagram and Messenger drafts. When a channel's switch is "Draft for staff" (src/lib/replyMode.ts),
// Clara's answer is not sent but kept in social_drafts (src/lib/metaChat.ts). Staff see it on /admin with
// the customer's message, change it if needed and send it, or discard it.
//
// Meta only takes a reply within 24 hours of the customer's last message: an older draft is shown as late,
// and Meta's refusal is shown plainly if sending fails. What staff changed counts towards the "right first
// time" score, and a changed fact waits on /admin → Knowledge as a correction (src/lib/feedback.ts).

import { socialDraftDiscarded, socialDraftSent } from "./feedback";
import { instagram } from "./instagram";
import { messenger } from "./messenger";
import { metaChannelConfigured, sendToPerson, type MetaChannel } from "./metaChat";
import { getReplyModes, type ReplyMode } from "./replyMode";
import { supabaseRest as rest } from "./supabase";

/** Meta's standard messaging window. */
const REPLY_WINDOW_MS = 24 * 3_600_000;

export type SocialChannel = "instagram" | "messenger";
const CHANNELS: Record<SocialChannel, MetaChannel> = { instagram, messenger };

export const isSocialChannel = (value: unknown): value is SocialChannel => value === "instagram" || value === "messenger";

type DraftStatus = "pending" | "sending" | "sent" | "discarded" | "failed";

export type SocialDraft = {
  id: number;
  channel: SocialChannel;
  psid: string;
  customer_name: string | null;
  conversation_id: string | null;
  question: string | null;
  reply: string;
  status: DraftStatus;
  sent_text: string | null;
  error: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
};

const FIELDS =
  "id,channel,psid,customer_name,conversation_id,question,reply,status,sent_text,error,decided_by,decided_at,created_at";

export type SocialState = {
  channels: Record<SocialChannel, { configured: boolean; mode: ReplyMode }>;
  /** Waiting for staff (and the ones Meta refused), newest first, with the time Meta stops taking a reply. */
  waiting: (Omit<SocialDraft, "psid"> & { lateAt: string })[];
  decided: Omit<SocialDraft, "psid">[];
};

/** The person's Meta id stays on the server: staff do not need it. */
function withoutPsid<T extends { psid: string }>(draft: T): Omit<T, "psid"> {
  const copy: Partial<T> = { ...draft };
  delete copy.psid;
  return copy as Omit<T, "psid">;
}

/** For /admin: each channel's switch and whether it is set up, the drafts waiting and the last decided. */
export async function socialState(): Promise<SocialState> {
  const [modes, waiting, decided] = await Promise.all([
    getReplyModes(),
    rest<SocialDraft[]>(`social_drafts?status=in.(pending,failed)&select=${FIELDS}&order=created_at.desc&limit=50`),
    rest<SocialDraft[]>(`social_drafts?status=in.(sent,discarded)&select=${FIELDS}&order=decided_at.desc&limit=10`),
  ]);
  return {
    channels: {
      instagram: { configured: metaChannelConfigured(instagram), mode: modes.instagram },
      messenger: { configured: metaChannelConfigured(messenger), mode: modes.messenger },
    },
    waiting: waiting.map((draft) => ({
      ...withoutPsid(draft),
      lateAt: new Date(Date.parse(draft.created_at) + REPLY_WINDOW_MS).toISOString(),
    })),
    decided: decided.map(withoutPsid),
  };
}

/** Meta's answer when the 24-hour window has closed (error subcode 2018278). */
const WINDOW_CLOSED = /2018278|outside of allowed window/i;

/** Staff send a draft, as written by Clara or changed. Only one staff member can send it. */
export async function sendDraft(id: number, text: string, staffName: string | null): Promise<{ ok: boolean; error?: string }> {
  const message = text.trim();
  if (!message) return { ok: false, error: "The message is empty." };
  const [draft] = await rest<SocialDraft[]>(`social_drafts?id=eq.${id}&status=in.(pending,failed)&select=${FIELDS}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify({ status: "sending", error: null }),
  });
  if (!draft) return { ok: false, error: "This draft was already sent or discarded." };

  try {
    await sendToPerson(CHANNELS[draft.channel], draft.psid, message);
  } catch (error) {
    console.error(`${draft.channel} draft ${id} could not be sent`, error);
    const reason = WINDOW_CLOSED.test(String(error))
      ? "Meta no longer accepts a reply: more than 24 hours have passed since the customer's last message."
      : "Meta refused the message. Please try again in a moment.";
    await rest(`social_drafts?id=eq.${id}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ status: "failed", error: reason }),
    });
    return { ok: false, error: reason };
  }

  await rest(`social_drafts?id=eq.${id}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ status: "sent", sent_text: message, decided_by: staffName, decided_at: new Date().toISOString(), error: null }),
  });
  await socialDraftSent(draft, message).catch((error) => console.error("draft outcome not stored", id, error));
  return { ok: true };
}

/** Staff decide the customer gets no answer from this draft. */
export async function discardDraft(id: number, staffName: string | null): Promise<{ ok: boolean; error?: string }> {
  const [draft] = await rest<{ id: number }[]>(`social_drafts?id=eq.${id}&status=in.(pending,failed)&select=id`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify({ status: "discarded", decided_by: staffName, decided_at: new Date().toISOString() }),
  });
  if (!draft) return { ok: false, error: "This draft was already sent or discarded." };
  await socialDraftDiscarded(id).catch((error) => console.error("draft outcome not stored", id, error));
  return { ok: true };
}
