// Messenger and Instagram direct messages, handled by the web app (no Make.com):
//
//   message        → Meta webhook → /api/<channel>/webhook → Ellie via that channel's Custom Channel trigger
//   Ellie's answer → /api/<channel>/reply → that channel's Send API
//
// A person's messages continue one ElevenLabs conversation for 10 minutes. Supabase keeps one row
// per person (messenger_threads / instagram_threads): their conversation and the last answer sent,
// so a repeated delivery never sends twice. No message text is stored.
//
// The two channels differ only in the settings below (src/lib/messenger.ts, src/lib/instagram.ts).

import { hasValidWebhookSignature, secretMatches } from "./agentAuth";
import { constantTimeEqual, sha256Hex } from "./auth";
import { customerForChannel, rememberConversation } from "./customers";
import { plainReply } from "./emailParse";
import { supabaseConfigured, supabaseRest as rest } from "./supabase";

export type MetaChannel = {
  channel: "messenger" | "instagram";
  /** For logs and messages to Ellie. */
  label: string;
  table: "messenger_threads" | "instagram_threads";
  /** Put in user_message_id, so Ellie's answer can be traced back to the person. */
  prefix: string;
  /** Meta's `object` for this channel's webhooks. */
  webhookObject: "page" | "instagram";
  /** The platform's limit for one text message. */
  maxText: number;
  /** Our own Page or Instagram account: its echoes are not answered. */
  ownId: () => string | undefined;
  inbound: () => { url?: string; secret?: string };
  hasToken: () => boolean;
  token: () => Promise<string>;
  /** Graph API base, e.g. https://graph.facebook.com/v25.0 */
  api: string;
  sendPath: () => string;
  /** Messenger wants messaging_type: RESPONSE on replies. */
  messagingType: boolean;
  profileFields: string;
  profileName: (profile: Record<string, unknown>) => string | undefined;
  /** Replies to conversations the old Make scenarios started carry "<id>|<mid>" without our prefix. */
  acceptsBareIds: boolean;
};

const CONTINUE_MS = 10 * 60_000;
const q = encodeURIComponent;

type Thread = { psid: string; conversation_id: string | null; updated_at: string; last_reply: string | null };

export function metaChannelConfigured(ch: MetaChannel): boolean {
  const inbound = ch.inbound();
  return Boolean(supabaseConfigured() && ch.ownId() && inbound.url && inbound.secret && ch.hasToken());
}

async function graphPost(ch: MetaChannel, path: string, body: unknown) {
  const response = await fetch(`${ch.api}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await ch.token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${ch.label} ${path} failed with ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

/** The person's name, asked once when they first write, so Ellie can greet them. Best effort. */
async function senderName(ch: MetaChannel, id: string): Promise<string | undefined> {
  try {
    const response = await fetch(`${ch.api}/${q(id)}?fields=${ch.profileFields}`, {
      headers: { Authorization: `Bearer ${await ch.token()}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok ? ch.profileName((await response.json()) as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

// --- a message from the customer -----------------------------------------------------------------

type MessagingEvent = {
  sender?: { id?: string };
  message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: unknown[] };
};
export type MetaWebhook = { object?: string; entry?: { messaging?: MessagingEvent[] }[] };

async function sendToEllie(ch: MetaChannel, id: string, mid: string, text: string, conversationId: string | null) {
  const inbound = ch.inbound();
  const response = await fetch(inbound.url ?? "", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Webhook-Secret": inbound.secret ?? "" },
    body: JSON.stringify({
      data: { type: "user_message", text: text.slice(0, 4000), user_identifier: id },
      user_message_id: `${ch.prefix}${id}|${mid}`,
      ...(conversationId ? { conversation_id: conversationId } : {}),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => ({}))) as { conversation_id?: string };
  if (!response.ok || !body.conversation_id) throw new Error(`${ch.label} Custom Channel inbound failed with ${response.status}`);
  return body.conversation_id;
}

async function passToEllie(ch: MetaChannel, id: string, mid: string, text: string) {
  // "…" while Ellie writes. Cosmetic, so a failure is ignored.
  void graphPost(ch, ch.sendPath(), { recipient: { id }, sender_action: "typing_on" }).catch(() => {});

  const [thread] = await rest<Thread[]>(`${ch.table}?psid=eq.${q(id)}&select=*`);
  const customer = await customerForChannel({ channel: ch.channel, key: id, name: thread ? undefined : await senderName(ch, id) }, false);

  const continueId =
    thread?.conversation_id && Date.now() - new Date(thread.updated_at).getTime() < CONTINUE_MS ? thread.conversation_id : null;
  let conversationId: string;
  try {
    conversationId = await sendToEllie(ch, id, mid, text, continueId);
  } catch (error) {
    // A conversation ElevenLabs will not continue any more: start a new one instead.
    if (!continueId) throw error;
    conversationId = await sendToEllie(ch, id, mid, text, null);
  }

  await Promise.all([
    rest(`${ch.table}?on_conflict=psid`, {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: JSON.stringify({ psid: id, conversation_id: conversationId, updated_at: new Date().toISOString() }),
    }),
    rememberConversation(conversationId, customer.id, ch.channel),
  ]);
}

/** Handles every message in one webhook call. Our own echoes and empty events are skipped. */
export async function handleMetaWebhook(ch: MetaChannel, payload: MetaWebhook): Promise<number> {
  if (payload.object !== ch.webhookObject) return 0;
  let handled = 0;
  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      const id = event.sender?.id;
      const message = event.message;
      if (!id || !message?.mid || message.is_echo || id === ch.ownId()) continue;
      const text =
        message.text?.trim() ||
        (message.attachments?.length ? `[The customer sent a photo or file, which you cannot see on ${ch.label}.]` : "");
      if (!text) continue;
      try {
        await passToEllie(ch, id, message.mid, text);
        handled++;
      } catch (error) {
        console.error(`${ch.label} message could not be passed to Ellie`, error);
      }
    }
  }
  return handled;
}

// --- Ellie's answer ------------------------------------------------------------------------------

export type MetaReply = {
  conversation_id?: string;
  user_message_ids?: string[];
  status?: string;
  data?: { type?: string; event?: { agent_response?: unknown; response_id?: unknown } }[];
};

/** Splits a long answer at paragraph breaks into messages the platform accepts. */
function chunks(text: string, max: number): string[] {
  const parts: string[] = [];
  let current = "";
  for (const paragraph of text.split(/\n{2,}/)) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length <= max) {
      current = next;
      continue;
    }
    if (current) parts.push(current);
    current = paragraph.length > max ? paragraph.slice(0, max) : paragraph;
  }
  if (current) parts.push(current);
  return parts;
}

function recipientFrom(ch: MetaChannel, ids: string[] | undefined): string | undefined {
  for (const id of ids ?? []) {
    if (typeof id !== "string") continue;
    if (id.startsWith(ch.prefix)) return id.slice(ch.prefix.length).split("|")[0];
    if (ch.acceptsBareIds && /^\d+\|/.test(id)) return id.split("|")[0];
  }
  return undefined;
}

/**
 * One call per turn. The row's last_reply is claimed before sending, so a repeated delivery of the
 * same answer stops here; if the platform refuses, the claim is released and ElevenLabs' retry can
 * send it.
 */
export async function handleMetaReply(ch: MetaChannel, payload: MetaReply): Promise<{ outcome: string }> {
  let id = recipientFrom(ch, payload.user_message_ids);
  if (!id && payload.conversation_id) {
    const [thread] = await rest<Thread[]>(`${ch.table}?conversation_id=eq.${q(payload.conversation_id)}&select=psid&limit=1`);
    id = thread?.psid;
  }
  if (!id) return { outcome: `not a ${ch.label} conversation` };
  if (payload.status === "failed") {
    console.error(`Ellie could not answer a ${ch.label} message`, payload.conversation_id);
    return { outcome: "failed" };
  }

  const answers = (payload.data ?? []).filter((item) => item.type === "agent_response");
  const text = plainReply(
    answers
      .map((item) => item.event?.agent_response)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join("\n\n"),
  );
  if (!text) return { outcome: "no text in this turn" };

  const responseIds = answers.map((item) => String(item.event?.response_id ?? "")).join(".");
  const key = `${payload.conversation_id ?? ""}.${responseIds || (payload.user_message_ids ?? []).join(".")}`.replace(/[^\w.-]/g, "");

  await rest(`${ch.table}?on_conflict=psid`, {
    method: "POST",
    prefer: "resolution=ignore-duplicates,return=minimal",
    body: JSON.stringify({ psid: id, conversation_id: payload.conversation_id ?? null, updated_at: new Date().toISOString() }),
  });
  const claimed = await rest<Thread[]>(`${ch.table}?psid=eq.${q(id)}&or=(last_reply.is.null,last_reply.neq.${key})`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify({ last_reply: key, updated_at: new Date().toISOString() }),
  });
  if (!claimed.length) return { outcome: "already sent" };

  try {
    for (const part of chunks(text, ch.maxText)) {
      await graphPost(ch, ch.sendPath(), {
        recipient: { id },
        ...(ch.messagingType ? { messaging_type: "RESPONSE" } : {}),
        message: { text: part },
      });
    }
    return { outcome: "sent" };
  } catch (error) {
    await rest(`${ch.table}?psid=eq.${q(id)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ last_reply: null }),
    }).catch(() => {});
    throw error;
  }
}

// --- the routes ----------------------------------------------------------------------------------

async function validMetaSignature(rawBody: string, header: string | null): Promise<boolean> {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return true;
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(mac), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return constantTimeEqual(await sha256Hex(hex), await sha256Hex(header.slice("sha256=".length)));
}

/**
 * The Meta webhook (Callback URL) for one channel. No browser and no site password: the secret in
 * the URL (?token=) is the proof, and it is also the "Verify token" typed in the Meta app. With
 * META_APP_SECRET set, Meta's X-Hub-Signature-256 is checked as well.
 */
export function metaWebhookRoute(ch: MetaChannel, secretName: string) {
  return {
    /** Meta checks the Callback URL once, when it is saved in the app. */
    async GET(request: Request) {
      const url = new URL(request.url);
      const ok =
        url.searchParams.get("hub.mode") === "subscribe" &&
        (await secretMatches(url.searchParams.get("hub.verify_token"), process.env[secretName]));
      if (!ok) return new Response("Forbidden", { status: 403 });
      return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
    },

    /** New messages. Always 200 once the secret matches: Meta turns off webhooks that keep failing. */
    async POST(request: Request) {
      if (!(await secretMatches(new URL(request.url).searchParams.get("token"), process.env[secretName]))) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
      const rawBody = await request.text();
      if (!(await validMetaSignature(rawBody, request.headers.get("x-hub-signature-256")))) {
        return Response.json({ error: "Invalid signature" }, { status: 403 });
      }
      if (!metaChannelConfigured(ch)) {
        console.error(`${ch.label} webhook: not configured`);
        return Response.json({ ok: false, reason: "not configured" });
      }
      let payload: MetaWebhook;
      try {
        payload = JSON.parse(rawBody) as MetaWebhook;
      } catch {
        return Response.json({ ok: true, ignored: "unreadable body" });
      }
      try {
        return Response.json({ ok: true, handled: await handleMetaWebhook(ch, payload) });
      } catch (error) {
        console.error(`${ch.label} webhook failed`, error);
        return Response.json({ ok: false });
      }
    },
  };
}

/** The "Reply Webhook URL" of the channel's Custom Channel trigger, signed with its Outbound Signing Secret. */
export function metaReplyRoute(ch: MetaChannel, signingSecretName: string) {
  return async function POST(request: Request) {
    const rawBody = await request.text();
    const signature = request.headers.get("elevenlabs-signature");
    if (!(await hasValidWebhookSignature(rawBody, signature, process.env[signingSecretName]))) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }
    let payload: MetaReply;
    try {
      payload = JSON.parse(rawBody) as MetaReply;
    } catch {
      return Response.json({ ok: true, ignored: "unreadable body" });
    }
    try {
      return Response.json({ ok: true, ...(await handleMetaReply(ch, payload)) });
    } catch (error) {
      // 500 so ElevenLabs delivers it again; the claim on the reply was released.
      console.error(`${ch.label} reply failed`, error);
      return Response.json({ error: "The reply could not be sent" }, { status: 500 });
    }
  };
}
