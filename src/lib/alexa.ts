// The Alexa skill "CDA Assistant": a customer talks to Ellie through an Echo or the Alexa app.
//
//   "Alexa, ask cda assistant why my oven shows F3"
//     → Amazon → /api/alexa → Ellie through her "CDA Alexa" Custom Channel
//     → Ellie's answer → /api/alexa/reply (stored for a moment) → /api/alexa reads it out
//
// Alexa waits about 8 seconds for an answer. Ellie usually needs 2–5, so /api/alexa waits for her
// answer to arrive; if it does not in time, the customer says "continue" to hear it. Answers are
// kept in Supabase (alexa_replies) only until they are read out.

import { createHash, verify as verifySignature, X509Certificate } from "node:crypto";
import { rootCertificates } from "node:tls";
import { customerForChannel, rememberConversation } from "./customers";
import { plainReply } from "./emailParse";
import { supabaseConfigured, supabaseRest as rest } from "./supabase";

const q = encodeURIComponent;
/**
 * Give up waiting for Ellie in time for Alexa's 8-second limit. Counted from the moment Amazon sent
 * the request, not from the moment this route woke up: a cold start can eat a second before any of
 * our code runs, and Alexa's clock is the one that decides.
 */
const ANSWER_DEADLINE_MS = 7_000;
const POLL_MS = 180;
/** Amazon rejects requests whose timestamp is older than this. */
const MAX_REQUEST_AGE_MS = 150_000;
export const MESSAGE_ID_PREFIX = "alexa|";

export function alexaConfigured(): boolean {
  return Boolean(
    supabaseConfigured() &&
      process.env.ALEXA_SKILL_ID &&
      process.env.ALEXA_CHANNEL_INBOUND_URL &&
      process.env.ALEXA_CHANNEL_INBOUND_SECRET,
  );
}

// --- is this really Amazon, for our skill? -----------------------------------------------------------

const certificates = new Map<string, { chain: X509Certificate[]; at: number }>();
const ROOTS = rootCertificates.map((pem) => new X509Certificate(pem));

function certificateUrlOk(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return (
      url.protocol === "https:" &&
      url.hostname.toLowerCase() === "s3.amazonaws.com" &&
      (url.port === "" || url.port === "443") &&
      url.pathname.startsWith("/echo.api/")
    );
  } catch {
    return false;
  }
}

async function certificateChain(url: string): Promise<X509Certificate[]> {
  const cached = certificates.get(url);
  if (cached && Date.now() - cached.at < 3_600_000) return cached.chain;
  const pem = await (await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5_000) })).text();
  const chain = (pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? []).map(
    (block) => new X509Certificate(block),
  );
  certificates.set(url, { chain, at: Date.now() });
  return chain;
}

/**
 * Amazon's certificate for signing skill requests: for echo-api.amazon.com and current, signed link by
 * link up to a root this server trusts. Amazon's file also carries older cross-signed certificates
 * above the root it really uses, so the chain is trusted at the first certificate a trusted root
 * signed, not only at the top of the file.
 */
export function amazonChainOk(chain: X509Certificate[], now = Date.now()): boolean {
  const leaf = chain[0];
  if (!leaf) return false;
  if (!(leaf.subjectAltName ?? "").split(/,\s*/).includes("DNS:echo-api.amazon.com")) return false;
  for (let i = 0; i < chain.length; i++) {
    const cert = chain[i];
    if (now < Date.parse(cert.validFrom) || now > Date.parse(cert.validTo)) return false;
    const anchored = ROOTS.some(
      (root) => root.fingerprint256 === cert.fingerprint256 || (cert.checkIssued(root) && cert.verify(root.publicKey)),
    );
    if (anchored) return true;
    const issuer = chain[i + 1];
    if (!issuer || !cert.checkIssued(issuer) || !cert.verify(issuer.publicKey)) return false;
  }
  return false;
}

/**
 * Amazon signs every request (headers SignatureCertChainUrl and Signature-256). Required for a skill
 * with its own endpoint, and what keeps anyone else from using Ellie through this route.
 */
export async function isFromAmazon(request: Request, rawBody: string): Promise<boolean> {
  if (process.env.NODE_ENV !== "production" && process.env.ALEXA_DEV_SKIP_SIGNATURE === "1") return true;
  const url = request.headers.get("signaturecertchainurl");
  const signature = request.headers.get("signature-256");
  if (!certificateUrlOk(url) || !signature) return false;
  try {
    const chain = await certificateChain(url as string);
    if (!amazonChainOk(chain)) return false;
    return verifySignature("sha256", Buffer.from(rawBody), chain[0].publicKey, Buffer.from(signature, "base64"));
  } catch (error) {
    console.error("Alexa signature check failed", error);
    return false;
  }
}

// --- the request and the response --------------------------------------------------------------------

export type AlexaRequest = {
  session?: {
    new?: boolean;
    attributes?: { conversationId?: string; pendingMessageId?: string };
    application?: { applicationId?: string };
    user?: { userId?: string };
  };
  context?: {
    System?: {
      application?: { applicationId?: string };
      user?: { userId?: string };
      apiEndpoint?: string;
      apiAccessToken?: string;
    };
  };
  request?: {
    type?: string;
    requestId?: string;
    timestamp?: string;
    intent?: { name?: string; slots?: Record<string, { value?: string }> };
  };
};

export function isForOurSkill(body: AlexaRequest): boolean {
  const id = body.session?.application?.applicationId ?? body.context?.System?.application?.applicationId;
  const age = Math.abs(Date.now() - Date.parse(body.request?.timestamp ?? ""));
  return Boolean(id && id === process.env.ALEXA_SKILL_ID && age <= MAX_REQUEST_AGE_MS);
}

type Session = { conversationId?: string; pendingMessageId?: string };

/** What Alexa says. The microphone stays open for a follow-up unless `end` is set. */
export function say(text: string, session: Session = {}, end = false) {
  return {
    version: "1.0",
    sessionAttributes: session,
    response: {
      outputSpeech: { type: "PlainText", text: text.slice(0, 7_900) },
      ...(end ? {} : { reprompt: { outputSpeech: { type: "PlainText", text: "Anything else about your CDA appliance?" } } }),
      shouldEndSession: end,
    },
  };
}

// --- asking Ellie --------------------------------------------------------------------------------------

/** "One moment" is spoken while Ellie thinks (Alexa's progressive response). Cosmetic, never awaited long. */
export function sayOneMoment(body: AlexaRequest) {
  const system = body.context?.System;
  if (!system?.apiEndpoint || !system.apiAccessToken || !body.request?.requestId) return;
  void fetch(`${system.apiEndpoint}/v1/directives`, {
    method: "POST",
    headers: { Authorization: `Bearer ${system.apiAccessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ header: { requestId: body.request.requestId }, directive: { type: "VoicePlayer.Speak", speech: "One moment." } }),
    signal: AbortSignal.timeout(3_000),
  }).catch(() => {});
}

async function sendToEllie(text: string, messageId: string, speaker: string, conversationId: string | undefined) {
  const response = await fetch(process.env.ALEXA_CHANNEL_INBOUND_URL ?? "", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Webhook-Secret": process.env.ALEXA_CHANNEL_INBOUND_SECRET ?? "" },
    body: JSON.stringify({
      // The marker tells Ellie this is a smart speaker (her prompt: "Alexa only").
      data: { type: "user_message", text: `[Alexa] ${text}`.slice(0, 2_000), user_identifier: speaker },
      user_message_id: messageId,
      ...(conversationId ? { conversation_id: conversationId } : {}),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  const body = (await response.json().catch(() => ({}))) as { conversation_id?: string };
  if (!response.ok || !body.conversation_id) throw new Error(`Alexa Custom Channel inbound failed with ${response.status}`);
  return body.conversation_id;
}

/** The person behind an Alexa account, shortened: Amazon's user ids are very long. */
function speakerKey(body: AlexaRequest): string {
  const userId = body.session?.user?.userId ?? body.context?.System?.user?.userId ?? "unknown";
  return createHash("sha256").update(userId).digest("hex").slice(0, 32);
}

/** Starts Ellie on the question and returns the conversation and the id her answer will carry. */
export async function askEllie(body: AlexaRequest, text: string): Promise<{ conversationId: string; messageId: string }> {
  const messageId = `${MESSAGE_ID_PREFIX}${body.request?.requestId ?? crypto.randomUUID()}`;
  const speaker = speakerKey(body);
  const previous = body.session?.attributes?.conversationId;
  // Every millisecond counts against Alexa's 8 seconds, so who is speaking is looked up beside the
  // question rather than before it.
  const customer = customerForChannel({ channel: "alexa", key: speaker }, false).catch(() => null);

  let conversationId: string;
  try {
    conversationId = await sendToEllie(text, messageId, speaker, previous);
  } catch (error) {
    if (!previous) throw error;
    conversationId = await sendToEllie(text, messageId, speaker, undefined);
  }
  void customer.then((known) => (known ? rememberConversation(conversationId, known.id, "alexa") : null)).catch(() => {});
  return { conversationId, messageId };
}

/** Waits for Ellie's answer until `deadline`. Returns it (and forgets it) or null if it is not there yet. */
export async function waitForAnswer(messageId: string, deadline: number): Promise<string | null> {
  do {
    const rows = await rest<{ reply: string }[]>(`alexa_replies?message_id=eq.${q(messageId)}&select=reply`);
    if (rows[0]) {
      await rest(`alexa_replies?message_id=eq.${q(messageId)}`, { method: "DELETE", prefer: "return=minimal" });
      return rows[0].reply;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  } while (Date.now() < deadline);
  return null;
}

export function deadlineFrom(start: number, body?: AlexaRequest): number {
  const ours = start + ANSWER_DEADLINE_MS;
  const sent = Date.parse(body?.request?.timestamp ?? "");
  // A timestamp that disagrees with our clock by more than half a minute is not worth trusting.
  if (!Number.isFinite(sent) || Math.abs(sent - start) > 30_000) return ours;
  return Math.min(ours, sent + ANSWER_DEADLINE_MS);
}

// --- Ellie's answer arrives ------------------------------------------------------------------------------

export type AlexaReply = {
  conversation_id?: string;
  user_message_ids?: string[];
  status?: string;
  data?: { type?: string; event?: { agent_response?: unknown } }[];
};

/** Keeps Ellie's answer until /api/alexa reads it out, in a form fit to be spoken. */
export async function storeReply(payload: AlexaReply): Promise<{ outcome: string }> {
  const messageId = payload.user_message_ids?.find((id) => typeof id === "string" && id.startsWith(MESSAGE_ID_PREFIX));
  if (!messageId) return { outcome: "not an Alexa conversation" };

  const spoken =
    payload.status === "failed"
      ? "Sorry, I couldn't answer that just now. Please try again."
      : plainReply(
          (payload.data ?? [])
            .filter((item) => item.type === "agent_response")
            .map((item) => item.event?.agent_response)
            .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
            .join(" "),
        )
          .replace(/https?:\/\//g, "")
          .replace(/^\s*-\s+/gm, "")
          .replace(/\s*\n+\s*/g, " ");
  if (!spoken) return { outcome: "no text in this turn" };

  await rest("alexa_replies?on_conflict=message_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify({ message_id: messageId, conversation_id: payload.conversation_id ?? null, reply: spoken }),
  });
  // Answers nobody came back for are not kept.
  await rest(`alexa_replies?created_at=lt.${q(new Date(Date.now() - 15 * 60_000).toISOString())}`, {
    method: "DELETE",
    prefer: "return=minimal",
  }).catch(() => {});
  return { outcome: "stored" };
}
