// Customer memory shared by every channel. Tables live in Supabase (see supabase/schema.sql).
//
// A customer is a person. Every way of reaching them - a Telegram chat, an email address, an
// Instagram sender id, a website cookie - is a row in customer_channels, so one person can have
// several of the same kind with no special case.
//
// Ellie never asks anyone to identify themselves. A channel becomes linked either automatically
// (its id is inside the conversation id) or because the person signed in on the website and sent
// the short code from that channel.

import { elevenLabsConversation, type ConversationRecord } from "./elevenlabs";
import { normalisePhone } from "./phone";
import { supabaseConfigured, supabaseRest as rest } from "./supabase";

export const CHANNELS = ["telegram", "instagram", "messenger", "email", "phone", "website", "alexa", "slack"] as const;
export type Channel = (typeof CHANNELS)[number];

export type Customer = { id: string; name: string | null };
export type Identity = { channel: Channel; key: string; name?: string };
export type LinkedChannel = { channel: Channel; channel_key: string; verified: boolean };

/** What the agent is told. Deliberately no addresses, order numbers or other personal details. */
export type Profile = { name: string | null; channels: Channel[]; verified: boolean; recent: string[]; appliances: string[] };

export const customerStoreConfigured = supabaseConfigured;

const q = encodeURIComponent;

/** Loose on purpose: this only rejects obvious rubbish, it does not police valid addresses. */
export function normaliseEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}

// --- working out who is speaking -------------------------------------------------------------

/**
 * The channel's own id is inside the conversation id, and system__conversation_id is the only
 * dynamic variable that exists on every channel. Binding a tool parameter to a channel-specific
 * variable (integration__telegram_chat_id, or our own website_id) makes the conversation fail on
 * every other channel with "Missing required dynamic variables", so we do not use them.
 */
const TELEGRAM_CHAT = /_tg_(\d+)$/;
const FRESHDESK_TICKET = /_fd_(\d+)$/;

async function freshdeskRequester(ticket: string): Promise<{ email: string; name?: string } | null> {
  const apiKey = process.env.FRESHDESK_API_KEY;
  const subdomain = process.env.FRESHDESK_SUBDOMAIN;
  if (!apiKey || !subdomain) return null;

  try {
    // Freshdesk signs in with the API key as the username and "X" as the password.
    const response = await fetch(`https://${subdomain}.freshdesk.com/api/v2/tickets/${ticket}?include=requester`, {
      headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:X`).toString("base64")}` },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { requester?: { email?: string; name?: string } };
    const email = normaliseEmail(body.requester?.email);
    return email ? { email, name: body.requester?.name?.trim() || undefined } : null;
  } catch (error) {
    console.error("Freshdesk requester lookup failed", error);
    return null;
  }
}

/** Who this turn is from, worked out from the conversation id alone. */
export async function resolveIdentity(body: Record<string, unknown>): Promise<Identity | null> {
  const explicitChannel = typeof body.channel === "string" ? body.channel : "";
  const explicitKey = typeof body.channel_key === "string" ? body.channel_key.trim() : "";
  if (explicitKey && (CHANNELS as readonly string[]).includes(explicitChannel)) {
    return { channel: explicitChannel as Channel, key: explicitKey };
  }

  const conversationId = typeof body.conversation_id === "string" ? body.conversation_id : "";

  const telegram = conversationId.match(TELEGRAM_CHAT)?.[1];
  if (telegram) return { channel: "telegram", key: telegram };

  const ticket = conversationId.match(FRESHDESK_TICKET)?.[1];
  if (ticket) {
    const requester = await freshdeskRequester(ticket);
    if (requester) return { channel: "email", key: requester.email, name: requester.name };
  }

  // Asked side by side: Ellie is silent until this answers, and on a phone call that is heard.
  const [sender, messenger, instagram, record] = await Promise.all([
    emailSender(conversationId),
    threadSender("messenger_threads", conversationId),
    threadSender("instagram_threads", conversationId),
    storedConversation(conversationId),
  ]);
  if (sender) return { channel: "email", key: sender.email, name: sender.name };
  if (messenger) return { channel: "messenger", key: messenger };
  if (instagram) return { channel: "instagram", key: instagram };

  // A phone call, in or out: the customer's number as the phone network gave it.
  const phone = normalisePhone(record?.metadata?.phone_call?.external_number);
  if (phone) return { channel: "phone", key: phone };

  const makeInstagram = instagramSender(record);
  if (makeInstagram) return { channel: "instagram", key: makeInstagram };

  return null;
}

/** The conversation as ElevenLabs holds it (free to read). Null when it cannot be read. */
async function storedConversation(conversationId: string): Promise<ConversationRecord | null> {
  if (!conversationId) return null;
  try {
    return await elevenLabsConversation(conversationId);
  } catch (error) {
    console.error("conversation lookup failed", error);
    return null;
  }
}

/** A Messenger or Instagram conversation: the web app notes who is in it (src/lib/metaChat.ts). */
async function threadSender(table: "messenger_threads" | "instagram_threads", conversationId: string): Promise<string | null> {
  if (!conversationId) return null;
  try {
    const rows = await rest<{ psid: string }[]>(`${table}?conversation_id=eq.${q(conversationId)}&select=psid&limit=1`);
    return rows[0]?.psid ?? null;
  } catch (error) {
    console.error(`${table} sender lookup failed`, error);
    return null;
  }
}

/**
 * Instagram conversations started while Make.com carried Instagram: Make passed the sender's id as
 * the dynamic variable `instagram_id`. It is read from the stored conversation, never bound to a
 * tool parameter: a tool bound to a variable that only Instagram sends would fail on every other
 * channel.
 */
function instagramSender(record: ConversationRecord | null): string | null {
  if (record?.metadata?.async_metadata?.external_system !== "custom_channel") return null;
  const id = record.conversation_initiation_client_data?.dynamic_variables?.instagram_id;
  return typeof id === "string" && /^\d{5,30}$/.test(id) ? id : null;
}

/** An email that reached Ellie through Gmail push: the web app noted who sent it (src/lib/emailInbox.ts). */
async function emailSender(conversationId: string): Promise<{ email: string; name?: string } | null> {
  if (!conversationId) return null;
  try {
    const rows = await rest<{ from_email: string | null; from_name: string | null }[]>(
      `email_messages?conversation_id=eq.${q(conversationId)}&select=from_email,from_name&limit=1`,
    );
    const email = normaliseEmail(rows[0]?.from_email);
    return email ? { email, name: rows[0]?.from_name ?? undefined } : null;
  } catch (error) {
    console.error("Email sender lookup failed", error);
    return null;
  }
}

/**
 * True for a conversation the web app may still be about to register: an email is handed to Ellie
 * a moment before the push handler records which conversation it became. Telegram and Freshdesk
 * carry their id in the conversation id, so they never need to wait.
 */
export function mayBeRegisteredLate(conversationId: string): boolean {
  return Boolean(conversationId) && !TELEGRAM_CHAT.test(conversationId) && !FRESHDESK_TICKET.test(conversationId);
}

// --- customers and their channels ------------------------------------------------------------

export async function findByChannel({ channel, key }: Identity): Promise<{ customer: Customer; verified: boolean } | null> {
  const rows = await rest<{ verified: boolean; customers: Customer | Customer[] | null }[]>(
    `customer_channels?channel=eq.${q(channel)}&channel_key=eq.${q(key)}&select=verified,customers(id,name)&limit=1`,
  );
  const row = rows[0];
  if (!row) return null;
  // PostgREST returns an embedded row as an object; older versions wrap it in an array.
  const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  return customer ? { customer, verified: row.verified } : null;
}

export async function createCustomer(name?: string, authUserId?: string): Promise<Customer> {
  const [customer] = await rest<Customer[]>("customers?select=id,name", {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify({ name: name ?? null, auth_user_id: authUserId ?? null }),
  });
  return customer;
}

export async function attachChannel(customerId: string, { channel, key }: Identity, verified: boolean) {
  await rest("customer_channels?on_conflict=channel,channel_key", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify({ channel, channel_key: key, customer_id: customerId, verified }),
  });
}

export async function listChannels(customerId: string): Promise<LinkedChannel[]> {
  return rest<LinkedChannel[]>(
    `customer_channels?customer_id=eq.${q(customerId)}&select=channel,channel_key,verified&order=created_at.asc`,
  );
}

export async function removeChannel(customerId: string, channel: string, key: string) {
  await rest(
    `customer_channels?customer_id=eq.${q(customerId)}&channel=eq.${q(channel)}&channel_key=eq.${q(key)}`,
    { method: "DELETE", prefer: "return=minimal" },
  );
}

/**
 * Finds the customer this channel belongs to, creating an anonymous record the first time.
 *
 * Two messages from someone new can arrive at the same moment and both create a record. The first
 * one to claim the channel keeps it; the other drops its record and uses the winner, so no empty
 * duplicate is left behind.
 */
export async function customerForChannel(identity: Identity, verified: boolean): Promise<Customer> {
  const known = await findByChannel(identity);
  if (known) return known.customer;
  const customer = await createCustomer(identity.name);
  await rest("customer_channels?on_conflict=channel,channel_key", {
    method: "POST",
    prefer: "resolution=ignore-duplicates,return=minimal",
    body: JSON.stringify({ channel: identity.channel, channel_key: identity.key, customer_id: customer.id, verified }),
  });
  const owner = await findByChannel(identity);
  if (owner && owner.customer.id !== customer.id) {
    await rest(`customers?id=eq.${q(customer.id)}`, { method: "DELETE", prefer: "return=minimal" });
    return owner.customer;
  }
  return customer;
}

/**
 * Ellie decided an email came from a robot. The record made for its sender a moment earlier is
 * dropped again, but only if that is all it is: no account, no notes, no other channel and no other
 * conversation.
 */
export async function forgetRobotSender(conversationId: string | null) {
  if (!conversationId) return;
  const links = await rest<{ customer_id: string }[]>(
    `customer_conversations?conversation_id=eq.${q(conversationId)}&select=customer_id&limit=1`,
  );
  const id = links[0]?.customer_id;
  if (!id) return;
  const [owners, channels, notes, conversations] = await Promise.all([
    rest<{ auth_user_id: string | null }[]>(`customers?id=eq.${q(id)}&select=auth_user_id&limit=1`),
    listChannels(id),
    rest<{ id: number }[]>(`customer_notes?customer_id=eq.${q(id)}&select=id&limit=1`),
    rest<{ conversation_id: string }[]>(`customer_conversations?customer_id=eq.${q(id)}&select=conversation_id&limit=2`),
  ]);
  if (!owners[0] || owners[0].auth_user_id || notes.length || conversations.length > 1) return;
  if (channels.length > 1 || channels.some((channel) => channel.channel !== "email")) return;
  await rest(`customers?id=eq.${q(id)}`, { method: "DELETE", prefer: "return=minimal" });
}

/**
 * Website chat, voice and the avatar have no channel id inside the conversation id, and binding a
 * website-only dynamic variable would break every other channel. Instead the web app registers the
 * conversation as soon as it starts, and the agent's lookup finds it here.
 */
export async function customerForConversation(conversationId: string): Promise<Customer | null> {
  if (!conversationId) return null;
  const rows = await rest<{ customers: Customer | Customer[] | null }[]>(
    `customer_conversations?conversation_id=eq.${q(conversationId)}&select=customers(id,name)&limit=1`,
  );
  const customer = rows[0]?.customers;
  return (Array.isArray(customer) ? customer[0] : customer) ?? null;
}

/** Which channel a conversation came from, for the admin page. Null when it cannot be told. */
export async function conversationChannel(conversationId: string, isPhoneCall = false): Promise<string | null> {
  if (TELEGRAM_CHAT.test(conversationId)) return "telegram";
  if (isPhoneCall) return "phone";
  const rows = await rest<{ channel: string | null }[]>(
    `customer_conversations?conversation_id=eq.${q(conversationId)}&select=channel&limit=1`,
  );
  return rows[0]?.channel ?? null;
}

export async function profileFor(customer: Customer): Promise<Profile> {
  const [channels, notes, appliances] = await Promise.all([
    listChannels(customer.id),
    rest<{ summary: string }[]>(
      `customer_notes?customer_id=eq.${q(customer.id)}&select=summary&order=created_at.desc&limit=3`,
    ),
    rest<{ description: string }[]>(
      `customer_appliances?customer_id=eq.${q(customer.id)}&select=description&order=updated_at.desc&limit=5`,
    ).catch(() => []),
  ]);
  return {
    name: customer.name,
    channels: [...new Set(channels.map((row) => row.channel as Channel))],
    verified: channels.some((row) => row.verified),
    recent: notes.map((note) => note.summary),
    appliances: appliances.map((appliance) => appliance.description),
  };
}

// --- the account on the website --------------------------------------------------------------

/**
 * The customer behind a signed-in website account. If that email was already seen on the email
 * channel, the existing record is adopted so nothing they told us before is lost.
 */
export async function customerForAccount(authUserId: string, email: string, name?: string): Promise<Customer> {
  const byAuth = await rest<Customer[]>(
    `customers?auth_user_id=eq.${q(authUserId)}&select=id,name&limit=1`,
  );
  if (byAuth[0]) return byAuth[0];

  const existing = await findByChannel({ channel: "email", key: email });
  const customer = existing?.customer ?? (await createCustomer(name));

  await rest(`customers?id=eq.${q(customer.id)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify(name ? { auth_user_id: authUserId, name } : { auth_user_id: authUserId }),
  });
  // Signing in with that address proves it, so the email channel counts as verified.
  await attachChannel(customer.id, { channel: "email", key: email }, true);
  return { id: customer.id, name: name ?? customer.name };
}

// --- link codes ------------------------------------------------------------------------------

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0 or 1 to read out loud
const CODE_TTL_MINUTES = 30;

export async function createLinkCode(customerId: string): Promise<{ code: string; expiresAt: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const code = `CDA-${Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("")}`;
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();
  await rest("link_codes", {
    method: "POST",
    prefer: "return=minimal",
    body: JSON.stringify({ code, customer_id: customerId, expires_at: expiresAt }),
  });
  return { code, expiresAt };
}

export type RedeemResult =
  | { ok: true; customer: Customer; profile: Profile }
  | { ok: false; reason: "unknown_code" | "expired" | "already_used" };

/** Turns a code sent from a channel into a verified link for that channel. */
export async function redeemLinkCode(rawCode: string, identity: Identity): Promise<RedeemResult> {
  const code = rawCode.trim().toUpperCase().replace(/\s+/g, "");
  const rows = await rest<{ code: string; customer_id: string; expires_at: string; used_at: string | null }[]>(
    `link_codes?code=eq.${q(code)}&select=code,customer_id,expires_at,used_at&limit=1`,
  );
  const row = rows[0];
  if (!row) return { ok: false, reason: "unknown_code" };
  if (row.used_at) return { ok: false, reason: "already_used" };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };

  await adoptAnonymousOwner(identity, row.customer_id);
  await attachChannel(row.customer_id, identity, true);
  await rest(`link_codes?code=eq.${q(code)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({
      used_at: new Date().toISOString(),
      used_channel: identity.channel,
      used_key: identity.key,
    }),
  });

  const customers = await rest<Customer[]>(`customers?id=eq.${q(row.customer_id)}&select=id,name&limit=1`);
  const customer = customers[0];
  return { ok: true, customer, profile: await profileFor(customer) };
}

/**
 * A channel may already belong to an anonymous record, created while the person chatted or called
 * before they had an account. Its notes and conversations move to `customerId` and the record is
 * dropped, so nothing they told us before is lost. Returns "account" when the channel belongs to
 * someone else's account (left alone), "ok" otherwise.
 */
async function adoptAnonymousOwner(identity: Identity, customerId: string): Promise<"ok" | "account"> {
  const existing = await findByChannel(identity);
  if (!existing || existing.customer.id === customerId) return "ok";
  const owners = await rest<{ id: string; auth_user_id: string | null }[]>(
    `customers?id=eq.${q(existing.customer.id)}&select=id,auth_user_id&limit=1`,
  );
  if (!owners[0]) return "ok";
  if (owners[0].auth_user_id) return "account";
  for (const table of ["customer_notes", "customer_conversations"]) {
    await rest(`${table}?customer_id=eq.${q(existing.customer.id)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ customer_id: customerId }),
    });
  }
  await rest(`customers?id=eq.${q(existing.customer.id)}`, { method: "DELETE", prefer: "return=minimal" });
  return "ok";
}

/**
 * The customer's own phone number, added on the website while signed in. Ellie then knows them when
 * they call, and when CDA calls them. Not proven (no code is sent to the phone), so it is stored as
 * unverified, and a number that belongs to someone else's account is refused.
 */
export async function linkPhone(customerId: string, rawPhone: string): Promise<{ ok: true } | { ok: false; reason: "invalid" | "taken" }> {
  const phone = normalisePhone(rawPhone);
  if (!phone) return { ok: false, reason: "invalid" };
  const identity: Identity = { channel: "phone", key: phone };
  if ((await adoptAnonymousOwner(identity, customerId)) === "account") return { ok: false, reason: "taken" };
  await attachChannel(customerId, identity, false);
  return { ok: true };
}

// --- the memory itself -------------------------------------------------------------------------

/** Lets the post-call webhook file its note against the right customer. */
export async function rememberConversation(conversationId: string, customerId: string, channel: Channel) {
  if (!conversationId) return;
  await rest("customer_conversations?on_conflict=conversation_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify({ conversation_id: conversationId, customer_id: customerId, channel }),
  });
}

/** Returns false when the conversation was never tied to a customer, which is normal. */
/** A CDA model number as on a rating plate: letters then digits, e.g. FW952, CDI6121, FF881SC. */
const MODEL = /\b([A-Z]{1,5}\d{2,5}[A-Z0-9]{0,4})\b/;

/**
 * The appliances from ElevenLabs' post-call analysis ("Fridge freezer FW952, bought 4 August 2026",
 * several separated by "|"), kept against the customer of that conversation. The newest description
 * of a model replaces the older one. Returns how many were kept.
 */
export async function addAppliances(conversationId: string, value: unknown): Promise<number> {
  if (typeof value !== "string" || !value.trim()) return 0;
  const found = value
    .split("|")
    .map((part) => part.trim().replace(/\s+/g, " ").slice(0, 200))
    .map((description) => ({ description, model: description.toUpperCase().match(MODEL)?.[1] }))
    .filter((item): item is { description: string; model: string } => Boolean(item.model));
  if (!found.length) return 0;
  const customer = await customerForConversation(conversationId);
  if (!customer) return 0;
  await rest("customer_appliances?on_conflict=customer_id,model", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify(
      found.slice(0, 5).map(({ description, model }) => ({
        customer_id: customer.id,
        model,
        description,
        updated_at: new Date().toISOString(),
      })),
    ),
  });
  return found.length;
}

export async function addNote(conversationId: string, summary: string): Promise<boolean> {
  const rows = await rest<{ customer_id: string; channel: string | null }[]>(
    `customer_conversations?conversation_id=eq.${q(conversationId)}&select=customer_id,channel&limit=1`,
  );
  const link = rows[0];
  if (!link) return false;
  await rest("customer_notes", {
    method: "POST",
    prefer: "return=minimal",
    body: JSON.stringify({ customer_id: link.customer_id, channel: link.channel, summary }),
  });
  return true;
}

/** A note written by us rather than the post-call webhook, for example after an Aida call. */
export async function addCustomerNote(customerId: string, channel: string, summary: string) {
  await rest("customer_notes", {
    method: "POST",
    prefer: "return=minimal",
    body: JSON.stringify({ customer_id: customerId, channel, summary: summary.slice(0, 400) }),
  });
}

export async function getCustomer(customerId: string): Promise<Customer | null> {
  const rows = await rest<Customer[]>(`customers?id=eq.${q(customerId)}&select=id,name&limit=1`);
  return rows[0] ?? null;
}

/** The address a signed-in customer signed up with: their first verified email channel. */
export async function accountEmail(customerId: string): Promise<string | null> {
  const channels = await listChannels(customerId);
  return channels.find((row) => row.channel === "email" && row.verified)?.channel_key ?? null;
}
