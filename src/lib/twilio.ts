// Twilio's REST API with NDI's own account (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN), for the hand-over of
// a phone call to a colleague (src/lib/handover.ts) and its live sound (src/lib/liveSignal.ts). Clara's
// calls themselves go through ElevenLabs' Twilio integration; the web app only steps in on a call that is
// already running.
//
// Twilio calls the app back on /api/twilio/* (TwiML, call status, the live transcript), which is open
// past the site password (src/proxy.ts). Each of those URLs carries a key made from the Auth Token and
// the call, the same way the Gmail and Meta webhooks carry a secret in their URL.

import { appUrl } from "./appUrl";
import { constantTimeEqual, sha256Hex } from "./auth";

const API = "https://api.twilio.com/2010-04-01";

function credentials() {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set");
  return { sid, token };
}

export function twilioConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim());
}

/** GETs, or POSTs form fields to, the account's API, e.g. "/Calls.json". Throws with Twilio's message. */
export async function twilio<T>(path: string, fields?: Record<string, string>): Promise<T> {
  const { sid, token } = credentials();
  const response = await fetch(`${API}/Accounts/${sid}${path}`, {
    method: fields ? "POST" : "GET",
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      ...(fields ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: fields ? new URLSearchParams(fields) : undefined,
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as { message?: string; code?: number };
  if (!response.ok) {
    throw new Error(`Twilio ${path} failed with ${response.status}: ${body.message ?? "no details"}${body.code ? ` (${body.code})` : ""}`);
  }
  return body as T;
}

// --- Twilio calling the app back ------------------------------------------------------------------

/** A phone call the app follows: a call from a staff call list, or a call to NDI that Clara answered. */
export type CallKind = "list" | "incoming";
export type CallRef = { kind: CallKind; id: string };

export const isCallKind = (value: unknown): value is CallKind => value === "list" || value === "incoming";

async function callbackKey(ref: CallRef): Promise<string> {
  // A call-list call's key is the one it always had; a call to NDI's key also names its kind.
  const scope = ref.kind === "list" ? ref.id : `${ref.kind}:${ref.id}`;
  return (await sha256Hex(`ndi-handover:${credentials().token}:${scope}`)).slice(0, 32);
}

/** An absolute URL on this app for Twilio to call about one call, with that call's key. */
export async function callbackUrl(path: string, ref: CallRef, extra: Record<string, string> = {}): Promise<string> {
  const base = appUrl();
  if (!base) throw new Error("APP_URL is not set, so Twilio cannot reach the app");
  const kind: Record<string, string> = ref.kind === "list" ? {} : { kind: ref.kind };
  const query = new URLSearchParams({ item: ref.id, ...kind, key: await callbackKey(ref), ...extra });
  return `${base}${path}?${query}`;
}

/** The call a Twilio request is about, when its key is right. Null otherwise. */
export async function callFromCallback(request: Request): Promise<CallRef | null> {
  if (!twilioConfigured()) return null;
  const params = new URL(request.url).searchParams;
  const ref: CallRef = { kind: params.get("kind") === "incoming" ? "incoming" : "list", id: params.get("item") ?? "" };
  const key = params.get("key") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(ref.id) || !key) return null;
  return constantTimeEqual(await callbackKey(ref), key) ? ref : null;
}

/** Twilio posts form fields. Anything that is not text is left out. */
export async function twilioFields(request: Request): Promise<Record<string, string>> {
  const form = await request.formData().catch(() => null);
  const fields: Record<string, string> = {};
  form?.forEach((value, key) => {
    if (typeof value === "string") fields[key] = value;
  });
  return fields;
}

// --- TwiML ---------------------------------------------------------------------------------------

/** Text and attribute values inside TwiML. */
export function xml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** A whole TwiML document from the verbs inside <Response>, as the Twiml field of an API call takes it. */
export const twimlDocument = (verbs: string) => `<Response>${verbs}</Response>`;

/** The answer to a request from Twilio for what to do next. */
export function twimlResponse(verbs: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${twimlDocument(verbs)}`, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}
