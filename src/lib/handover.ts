// Hand-over of a phone call to a colleague, live on the phone: a call from a staff call list (to the
// colleague named for that call), or a call to NDI that Clara answered (to the hand-over team, rung one
// after another in the team's order, src/lib/handoverTeam.ts).
//
// When the moment comes, Clara tells the customer she is connecting them, and her tool transfer_to_human
// (POST /api/agent/handover) starts this:
//
//   1. The customer's call leaves Clara for hold music in a Twilio conference of its own. Clara's
//      conversation ends there.
//   2. The colleague's phone rings from NDI's number. They hear who is waiting and what Clara learnt,
//      and join by pressing a key. A voicemail cannot press a key, so it never joins. On a call to NDI,
//      the next colleague of the team is rung when one does not take it.
//   3. Twilio writes the talk down in any case, for the customer's memory: ElevenLabs is no longer on the
//      call. While a staff page shows the call live (src/lib/liveCall.ts), /admin also shows its sound and
//      the conversation with Aida's suggested answers.
//   4. If nobody takes the call, the customer hears that NDI will call back.
//   5. When the customer's call ends, the talk becomes one short note in the customer's memory; a call list
//      moves on to the next number, and a call to NDI is closed.
//
// Twilio reaches the app on /api/twilio/handover/*; every URL carries the call's key (src/lib/twilio.ts).

import { cleanText } from "./aida";
import { anthropicConfigured, askClaude } from "./anthropic";
import { addCustomerNote, findByChannel } from "./customers";
import { elevenLabsConversation } from "./elevenlabs";
import { nextTeamMember } from "./handoverTeam";
import { closeIncomingCall, ensureIncomingCall } from "./incomingCalls";
import { callPath, LINE_COLUMN, liveSoundTwiml, stopLive, talkTranscriptTwiml } from "./liveCall";
import { moodAfterHandover } from "./mood";
import { advance } from "./outboundCalls";
import { supabaseRest as rest } from "./supabase";
import { formatDate } from "./transcriptEmail";
import { callbackUrl, twilio, twilioConfigured, twimlDocument, xml, type CallKind, type CallRef } from "./twilio";

const q = encodeURIComponent;

/** How long the colleague's phone rings before it counts as not answered. */
const RING_SECONDS = 25;
/** After the brief, how long the colleague has to press a key. They are asked twice. */
const KEY_SECONDS = 8;

export const HANDOVER_LANGUAGES = ["en", "de", "it", "fr"] as const;
export type HandoverLanguage = (typeof HANDOVER_LANGUAGES)[number];
export type HandoverStatus = "ringing" | "live" | "ended" | "missed" | "abandoned" | "failed";

export type HandoverItem = {
  id: string;
  phone: string | null;
  name: string | null;
  instructions: string;
  conversation_id: string | null;
  call_sid: string | null;
  handover_name: string | null;
  handover_phone: string | null;
  handover_status: HandoverStatus | null;
  handover_summary: string | null;
  handover_language: HandoverLanguage | null;
  handover_call_sid: string | null;
  handover_started_at: string | null;
  handover_live_at: string | null;
  handover_ended_at: string | null;
  handover_note: string | null;
  /** Call lists only: the list that moves on when the call is over. */
  list_id?: string;
  /** Calls to NDI only: the number they called, which the colleagues are rung from. */
  ndi_number?: string | null;
  /** Calls to NDI only: the team members rung so far for this hand-over. */
  handover_tried?: string[];
};

const FIELDS =
  "id,phone,name,instructions,conversation_id,call_sid,handover_name,handover_phone,handover_status," +
  "handover_summary,handover_language,handover_call_sid,handover_started_at,handover_live_at,handover_ended_at,handover_note";
const fieldsOf = (kind: CallKind) => `${FIELDS},${kind === "list" ? "list_id" : "ndi_number,handover_tried"}`;

export async function handoverItem(ref: CallRef): Promise<HandoverItem | null> {
  const [item] = await rest<HandoverItem[]>(`${callPath(ref)}&select=${fieldsOf(ref.kind)}&limit=1`);
  return item ?? null;
}

/** Changes the hand-over only while it is still in one of the given states. False when it was not. */
async function moveOn(ref: CallRef, from: HandoverStatus[], update: Record<string, unknown>): Promise<boolean> {
  const rows = await rest<{ id: string }[]>(`${callPath(ref)}&handover_status=in.(${from.join(",")})&select=id`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify(update),
  });
  return rows.length > 0;
}

// --- what people hear --------------------------------------------------------------------------

const VOICES: Record<HandoverLanguage, { language: string; voice: string }> = {
  en: { language: "en-GB", voice: "Polly.Amy-Neural" },
  de: { language: "de-DE", voice: "Polly.Vicki-Neural" },
  it: { language: "it-IT", voice: "Polly.Bianca-Neural" },
  fr: { language: "fr-FR", voice: "Polly.Lea-Neural" },
};

/** To the customer on hold when nobody takes the call. */
const SORRY: Record<HandoverLanguage, string> = {
  en: "I'm sorry, nobody from the NDI team can take the call right now. NDI will call you back soon. Thank you, and goodbye.",
  de: "Es tut mir leid, gerade ist niemand aus dem NDI-Team erreichbar. NDI ruft Sie bald zurück. Vielen Dank und auf Wiederhören.",
  it: "Mi dispiace, in questo momento nessuno del team NDI può rispondere. NDI la richiamerà presto. Grazie e arrivederci.",
  fr: "Je suis désolée, personne de l'équipe NDI n'est disponible pour le moment. NDI vous rappellera bientôt. Merci et au revoir.",
};

/** To the customer when the colleague has hung up. */
const GOODBYE: Record<HandoverLanguage, string> = {
  en: "Thank you for talking to NDI. Goodbye.",
  de: "Vielen Dank für das Gespräch mit NDI. Auf Wiederhören.",
  it: "Grazie per aver parlato con NDI. Arrivederci.",
  fr: "Merci d'avoir parlé avec NDI. Au revoir.",
};

const languageOf = (value: unknown): HandoverLanguage =>
  HANDOVER_LANGUAGES.includes(value as HandoverLanguage) ? (value as HandoverLanguage) : "en";

function say(text: string, language: HandoverLanguage = "en"): string {
  const { voice, language: code } = VOICES[language];
  return `<Say voice="${voice}" language="${code}">${xml(text)}</Say>`;
}

const conferenceName = (ref: CallRef) => `ndi-handover-${ref.id}`;

// --- Clara hands over -----------------------------------------------------------------------------

const NOT_POSSIBLE =
  "Nobody can take over this call. Apologise briefly and tell the customer that the NDI team will get back to them.";

/**
 * Clara's tool transfer_to_human. Its answer only matters when the hand-over cannot start: once the
 * call has moved, Clara is no longer on it.
 */
export async function startHandover(input: {
  conversationId: string;
  summary: unknown;
  language: unknown;
}): Promise<{ ok: boolean; message?: string }> {
  if (!input.conversationId || !twilioConfigured()) return { ok: false, message: NOT_POSSIBLE };
  const [listItem] = await rest<HandoverItem[]>(
    `call_list_items?conversation_id=eq.${q(input.conversationId)}&select=${fieldsOf("list")}&limit=1`,
  );
  if (listItem) return startFor({ kind: "list", id: listItem.id }, listItem, input);

  // A call to NDI: registered by customer_lookup as it started (or now, if that did not happen).
  const incoming = await ensureIncomingCall(input.conversationId);
  const call = incoming ? await handoverItem({ kind: "incoming", id: incoming.id }) : null;
  if (incoming && call) return startFor({ kind: "incoming", id: incoming.id }, call, input);
  return { ok: false, message: NOT_POSSIBLE };
}

async function startFor(
  ref: CallRef,
  item: HandoverItem,
  input: { conversationId: string; summary: unknown; language: unknown },
): Promise<{ ok: boolean; message?: string }> {
  if (item.handover_status) return { ok: true }; // already on its way: the tool was called twice

  // Whom to ring: the colleague named for this call-list call, or the team's first active member.
  const member = ref.kind === "incoming" ? await nextTeamMember([]) : null;
  const colleague = ref.kind === "list" ? item.handover_phone : member?.phone;
  if (!colleague) return { ok: false, message: NOT_POSSIBLE };

  // Twilio's id of the call, and NDI's number to ring the colleague from, as ElevenLabs recorded them.
  const record = await elevenLabsConversation(input.conversationId).catch(() => null);
  const callSid = item.call_sid || record?.metadata?.phone_call?.call_sid || null;
  let ndiNumber = record?.metadata?.phone_call?.agent_number || item.ndi_number || null;
  if (callSid && !ndiNumber) {
    // NDI's number dialled the customer (a call list), or the customer dialled it (a call to NDI).
    const call = await twilio<{ from?: string; to?: string }>(`/Calls/${callSid}.json`).catch(() => null);
    ndiNumber = (ref.kind === "list" ? call?.from : call?.to) ?? null;
  }
  if (!callSid || !ndiNumber) {
    console.error("hand-over: the call is not known to Twilio", input.conversationId);
    return { ok: false, message: NOT_POSSIBLE };
  }

  const [started] = await rest<HandoverItem[]>(`${callPath(ref)}&handover_status=is.null&select=${fieldsOf(ref.kind)}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify({
      handover_status: "ringing",
      handover_summary: cleanText(input.summary, 400) || null,
      handover_language: languageOf(input.language),
      call_sid: callSid,
      handover_started_at: new Date().toISOString(),
      ...(member
        ? { handover_name: member.name, handover_phone: member.phone, handover_tried: [member.id], ndi_number: ndiNumber }
        : {}),
    }),
  });
  if (!started) return { ok: true };

  // 1. The customer leaves Clara for hold music. Twilio asks /hold what to play (which starts the talk's
  //    transcript, and the live sound again if a staff page shows the call), and tells /status when the
  //    customer's call ends. What runs for a staff page stops first: Twilio allows only so many on a call.
  await stopLive(ref);
  try {
    await twilio(`/Calls/${callSid}.json`, {
      Url: await callbackUrl("/api/twilio/handover/hold", ref),
      Method: "POST",
      StatusCallback: await callbackUrl("/api/twilio/handover/status", ref, { leg: "customer" }),
      StatusCallbackMethod: "POST",
    });
  } catch (error) {
    console.error("hand-over: the customer's call could not be moved", error);
    await moveOn(ref, ["ringing"], { handover_status: "failed", handover_ended_at: new Date().toISOString() });
    return { ok: false, message: NOT_POSSIBLE };
  }

  // 2. The colleague's phone rings from NDI's number.
  if (!(await ringColleague(ref, started, ndiNumber)) && !(await ringNextMember(ref, started))) {
    await nobodyTakesIt(ref, started, "failed");
  }
  return { ok: true };
}

/** Rings the hand-over's current colleague. False when the call could not even be placed. */
async function ringColleague(ref: CallRef, item: HandoverItem, ndiNumber: string): Promise<boolean> {
  if (!item.handover_phone) return false;
  try {
    const call = await twilio<{ sid: string }>("/Calls.json", {
      To: item.handover_phone,
      From: ndiNumber,
      Timeout: String(RING_SECONDS),
      Twiml: await colleagueBrief(ref, item),
      StatusCallback: await callbackUrl("/api/twilio/handover/status", ref, { leg: "colleague" }),
      StatusCallbackMethod: "POST",
    });
    await rest(callPath(ref), { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ handover_call_sid: call.sid }) });
    return true;
  } catch (error) {
    console.error("hand-over: the colleague could not be rung", item.handover_name, error);
    return false;
  }
}

/**
 * A call to NDI that the colleague did not take: the next active member of the team is rung, while the
 * customer waits on hold. False when nobody is left (or for a call-list call, which names one colleague).
 */
async function ringNextMember(ref: CallRef, item: HandoverItem): Promise<boolean> {
  if (ref.kind !== "incoming" || !item.ndi_number) return false;
  let tried = item.handover_tried ?? [];
  for (;;) {
    const member = await nextTeamMember(tried);
    if (!member) return false;
    tried = [...tried, member.id];
    const moved = await moveOn(ref, ["ringing"], {
      handover_name: member.name,
      handover_phone: member.phone,
      handover_tried: tried,
      handover_call_sid: null,
    });
    if (!moved) return true; // the customer hung up or someone took the call meanwhile: nothing more to do
    const next = { ...item, handover_name: member.name, handover_phone: member.phone, handover_tried: tried };
    if (await ringColleague(ref, next, item.ndi_number)) return true;
  }
}

/** What the colleague hears when they pick up (in English), and the key that joins them to the customer. */
async function colleagueBrief(ref: CallRef, item: HandoverItem): Promise<string> {
  const action = xml(await callbackUrl("/api/twilio/handover/accept", ref));
  const ask = (text: string) => `<Gather numDigits="1" timeout="${KEY_SECONDS}" action="${action}" method="POST">${say(text)}</Gather>`;
  const hello = item.handover_name ? `Hello ${item.handover_name}.` : "Hello.";
  const kind = ref.kind === "list" ? "a customer from the NDI call list" : "a customer who called NDI";
  const who = item.name ? `${item.name}, ${kind}, is` : `${kind.charAt(0).toUpperCase()}${kind.slice(1)} is`;
  const said = item.handover_summary ? ` Clara says: ${item.handover_summary}` : "";
  return twimlDocument(
    ask(`${hello} ${who} waiting for you on the line.${said} Press any key to take the call.`) +
      ask("Press any key to take the call.") +
      say("No key was pressed, so the call goes to someone else or NDI calls back. Goodbye."),
  );
}

// --- Twilio calling back ---------------------------------------------------------------------------

/**
 * The customer's side after Clara: hold music until the colleague joins. The talk is written down in any
 * case, until the conference is over (not the goodbye), and its sound is copied if a staff page shows the call.
 */
export async function holdTwiml(ref: CallRef): Promise<string> {
  const item = await handoverItem(ref);
  const language = languageOf(item?.handover_language);
  if (item?.handover_status !== "ringing") return `${say(SORRY[language], language)}<Hangup/>`;
  const transcript = await talkTranscriptTwiml(ref);
  return (
    transcript.start +
    (await liveSoundTwiml(ref)) +
    `<Dial><Conference startConferenceOnEnter="false" endConferenceOnExit="true" beep="false">${conferenceName(ref)}</Conference></Dial>` +
    transcript.stop +
    say(GOODBYE[language], language)
  );
}

/** The colleague pressed a key: they join the customer, unless the customer has gone meanwhile. */
export async function colleagueJoins(ref: CallRef): Promise<string> {
  const joined = await moveOn(ref, ["ringing"], { handover_status: "live", handover_live_at: new Date().toISOString() });
  if (!joined) return `${say("Sorry, the customer is no longer on the line. Goodbye.")}<Hangup/>`;
  return (
    say("Connecting you now.") +
    `<Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false">${conferenceName(ref)}</Conference></Dial>` +
    say("The call has ended. Goodbye.")
  );
}

/**
 * One of the calls ended (Twilio's status callback). The colleague's call ending while the customer still
 * waits means they did not take it: the next colleague of the team is rung, or nobody takes it. The
 * customer's call ending ends the hand-over, whatever its state.
 */
export async function handoverLegEnded(ref: CallRef, leg: "customer" | "colleague", callSid?: string): Promise<void> {
  const item = await handoverItem(ref);
  if (!item?.handover_status) return;
  if (leg === "colleague") {
    // An earlier colleague's call, already given up on: the one ringing now decides.
    if (callSid && item.handover_call_sid && callSid !== item.handover_call_sid) return;
    // After a talk, the customer's own call ends too (the conference ends with the colleague).
    if (item.handover_status === "ringing" && !(await ringNextMember(ref, item))) await nobodyTakesIt(ref, item, "missed");
    return;
  }
  await finish(ref, item);
}

/** Nobody took the call: the customer, still on hold, hears that NDI will call back, and the call ends. */
async function nobodyTakesIt(ref: CallRef, item: HandoverItem, status: "missed" | "failed"): Promise<void> {
  if (!(await moveOn(ref, ["ringing"], { handover_status: status }))) return;
  // The customer is told NDI will call back: the mood alert, held while the colleague's phone rang, goes now.
  await moodAfterHandover(item.conversation_id, false, null);
  if (!item.call_sid) return;
  const language = languageOf(item.handover_language);
  await twilio(`/Calls/${item.call_sid}.json`, { Twiml: twimlDocument(`${say(SORRY[language], language)}<Hangup/>`) }).catch((error) =>
    console.error("hand-over: the customer could not be told", error),
  );
}

/** The customer's call is over: the hand-over ends, the talk is remembered, and the call is done. */
async function finish(ref: CallRef, item: HandoverItem): Promise<void> {
  const status: HandoverStatus =
    item.handover_status === "ringing" ? "abandoned" : item.handover_status === "live" ? "ended" : (item.handover_status ?? "failed");
  const endedAt = new Date().toISOString();
  const rows = await rest<{ id: string }[]>(`${callPath(ref)}&handover_ended_at=is.null&select=id`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify({ handover_status: status, handover_ended_at: endedAt }),
  });
  if (!rows.length) return; // finished already: Twilio repeated the callback

  // The customer hung up while waiting: the colleague's phone must not go on ringing.
  if (status === "abandoned" && item.handover_call_sid) {
    await twilio(`/Calls/${item.handover_call_sid}.json`, { Status: "completed" }).catch(() => {});
  }
  // Clara's mood alert waited for this: a colleague who talked with them has the customer; a customer who
  // hung up while waiting is still owed a call.
  if (status === "ended" || status === "abandoned") {
    await moodAfterHandover(item.conversation_id, status === "ended", item.handover_name);
  }
  if (status === "ended") {
    await rememberTalk(ref, { ...item, handover_ended_at: endedAt }).catch((error) =>
      console.error("hand-over: the talk could not be remembered", error),
    );
  }
  if (ref.kind === "list" && item.list_id) {
    await advance(item.list_id).catch((error) => console.error("call list could not move on", item.list_id, error));
  }
  if (ref.kind === "incoming") {
    await closeIncomingCall(ref.id).catch((error) => console.error("call to NDI could not be closed", ref.id, error));
  }
}

const NOTE_SYSTEM = `You write one line for NDI's customer memory about a phone call between a customer and an NDI colleague.
From the transcript, say in at most two short sentences what the customer wanted and what was agreed or promised next.
Plain text. No greeting, no phone numbers or email addresses.`;

/**
 * The talk as one short note: on the call, and in the customer's memory for every channel. The talk is
 * always transcribed (src/lib/liveCall.ts, talkTranscriptTwiml), so Claude can say what was agreed.
 */
async function rememberTalk(ref: CallRef, item: HandoverItem): Promise<void> {
  // The colleague's talk only: Clara's part has its own summary, from ElevenLabs.
  const since = item.handover_live_at ? `&created_at=gte.${q(item.handover_live_at)}` : "";
  const lines = await rest<{ speaker: string; text: string }[]>(
    `handover_lines?${LINE_COLUMN[ref.kind]}=eq.${q(ref.id)}&speaker=in.(customer,colleague)${since}&select=speaker,text&order=id.asc&limit=400`,
  );
  let what = "";
  if (lines.length && anthropicConfigured()) {
    const transcript = lines.map((line) => `${line.speaker === "customer" ? "Customer" : "NDI"}: ${line.text}`).join("\n");
    what = await askClaude({ system: NOTE_SYSTEM, prompt: transcript.slice(-6000), maxTokens: 160, timeoutMs: 20_000 })
      .then((text) => text.replace(/\s+/g, " ").trim())
      .catch(() => "");
  }
  const from = Date.parse(item.handover_live_at ?? item.handover_started_at ?? "");
  const minutes = Math.max(1, Math.round((Date.parse(item.handover_ended_at ?? "") - from) / 60_000) || 1);
  const when = formatDate(Number.isFinite(from) ? from : Date.now());
  const note = `Phone call with ${item.handover_name || "an NDI colleague"} (NDI) on ${when}, ${minutes} min${what ? `: ${what}` : "."}`;

  await rest(callPath(ref), { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ handover_note: note.slice(0, 600) }) });
  const owner = item.phone ? await findByChannel({ channel: "phone", key: item.phone }) : null;
  if (owner) await addCustomerNote(owner.customer.id, "phone", note);
}

// --- for /admin --------------------------------------------------------------------------------------

export const handoverActive = (item: Pick<HandoverItem, "handover_status">) =>
  item.handover_status === "ringing" || item.handover_status === "live";
