// Hand-over of a call-list call to a colleague, live on the phone.
//
// Staff may give a call a colleague (name and phone number) and say when Clara should hand over. When
// that moment comes, Clara tells the customer she is connecting them, and her tool transfer_to_human
// (POST /api/agent/handover) starts this:
//
//   1. The customer's call leaves Clara for hold music in a Twilio conference of its own, and Twilio
//      starts transcribing it live, both voices. Clara's conversation ends there.
//   2. The colleague's phone rings from NDI's number. They hear who is waiting and what Clara learnt,
//      and join by pressing a key. A voicemail cannot press a key, so it never joins.
//   3. While they talk, every finished sentence arrives at /api/twilio/handover/transcript, and /admin
//      shows the conversation with Aida's suggested answers.
//   4. If the colleague does not take the call, the customer hears that NDI will call back.
//   5. When the customer's call ends, the talk becomes one short note in the customer's memory, and the
//      call list moves on to the next number.
//
// Twilio reaches the app on /api/twilio/handover/*; every URL carries the item's key (src/lib/twilio.ts).

import { cleanText } from "./aida";
import { anthropicConfigured, askClaude } from "./anthropic";
import { addCustomerNote, findByChannel, profileFor } from "./customers";
import { elevenLabsConversation } from "./elevenlabs";
import { advance } from "./outboundCalls";
import { supabaseRest as rest } from "./supabase";
import { formatDate } from "./transcriptEmail";
import { callbackUrl, twilio, twilioConfigured, twimlDocument, xml } from "./twilio";

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
  list_id: string;
  phone: string;
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
};

const FIELDS =
  "id,list_id,phone,name,instructions,conversation_id,call_sid,handover_name,handover_phone,handover_status," +
  "handover_summary,handover_language,handover_call_sid,handover_started_at,handover_live_at,handover_ended_at,handover_note";

export async function handoverItem(itemId: string): Promise<HandoverItem | null> {
  const [item] = await rest<HandoverItem[]>(`call_list_items?id=eq.${q(itemId)}&select=${FIELDS}&limit=1`);
  return item ?? null;
}

/** Changes the hand-over only while it is still in one of the given states. False when it was not. */
async function moveOn(itemId: string, from: HandoverStatus[], update: Record<string, unknown>): Promise<boolean> {
  const rows = await rest<{ id: string }[]>(`call_list_items?id=eq.${q(itemId)}&handover_status=in.(${from.join(",")})&select=id`, {
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

const conferenceName = (itemId: string) => `ndi-handover-${itemId}`;
/** The live transcript is named so it can be stopped before the goodbye, which is not part of the talk. */
const TRANSCRIPTION = "handover";

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
  const [item] = await rest<HandoverItem[]>(
    `call_list_items?conversation_id=eq.${q(input.conversationId)}&select=${FIELDS}&limit=1`,
  );
  if (!item?.handover_phone) return { ok: false, message: NOT_POSSIBLE };
  if (item.handover_status) return { ok: true }; // already on its way: the tool was called twice

  // Twilio's id of the call, and NDI's number to ring the colleague from, as ElevenLabs recorded them.
  const record = await elevenLabsConversation(input.conversationId).catch(() => null);
  const callSid = item.call_sid || record?.metadata?.phone_call?.call_sid || null;
  let ndiNumber = record?.metadata?.phone_call?.agent_number || null;
  if (callSid && !ndiNumber) {
    ndiNumber = (await twilio<{ from?: string }>(`/Calls/${callSid}.json`).catch(() => null))?.from ?? null;
  }
  if (!callSid || !ndiNumber) {
    console.error("hand-over: the call is not known to Twilio", input.conversationId);
    return { ok: false, message: NOT_POSSIBLE };
  }

  const [started] = await rest<HandoverItem[]>(`call_list_items?id=eq.${q(item.id)}&handover_status=is.null&select=${FIELDS}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify({
      handover_status: "ringing",
      handover_summary: cleanText(input.summary, 400) || null,
      handover_language: languageOf(input.language),
      call_sid: callSid,
      handover_started_at: new Date().toISOString(),
    }),
  });
  if (!started) return { ok: true };

  // 1. The customer leaves Clara for hold music. Twilio asks /hold what to play, which also starts
  //    the live transcript, and tells /status when the customer's call ends.
  try {
    await twilio(`/Calls/${callSid}.json`, {
      Url: await callbackUrl("/api/twilio/handover/hold", item.id),
      Method: "POST",
      StatusCallback: await callbackUrl("/api/twilio/handover/status", item.id, { leg: "customer" }),
      StatusCallbackMethod: "POST",
    });
  } catch (error) {
    console.error("hand-over: the customer's call could not be moved", error);
    await moveOn(item.id, ["ringing"], { handover_status: "failed", handover_ended_at: new Date().toISOString() });
    return { ok: false, message: NOT_POSSIBLE };
  }

  // 2. The colleague's phone rings from NDI's number.
  try {
    const call = await twilio<{ sid: string }>("/Calls.json", {
      To: item.handover_phone,
      From: ndiNumber,
      Timeout: String(RING_SECONDS),
      Twiml: await colleagueBrief(started),
      StatusCallback: await callbackUrl("/api/twilio/handover/status", item.id, { leg: "colleague" }),
      StatusCallbackMethod: "POST",
    });
    await rest(`call_list_items?id=eq.${q(item.id)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ handover_call_sid: call.sid }),
    });
  } catch (error) {
    console.error("hand-over: the colleague could not be rung", error);
    await nobodyTakesIt(started, "failed");
  }
  return { ok: true };
}

/** What the colleague hears when they pick up (in English), and the key that joins them to the customer. */
async function colleagueBrief(item: HandoverItem): Promise<string> {
  const action = xml(await callbackUrl("/api/twilio/handover/accept", item.id));
  const ask = (text: string) => `<Gather numDigits="1" timeout="${KEY_SECONDS}" action="${action}" method="POST">${say(text)}</Gather>`;
  const hello = item.handover_name ? `Hello ${item.handover_name}.` : "Hello.";
  const who = item.name ? `${item.name}, a customer from the NDI call list, is` : "A customer from the NDI call list is";
  const said = item.handover_summary ? ` Clara says: ${item.handover_summary}` : "";
  return twimlDocument(
    ask(`${hello} ${who} waiting for you on the line.${said} Press any key to take the call.`) +
      ask("Press any key to take the call.") +
      say("No key was pressed, so the customer will hear that NDI calls back. Goodbye."),
  );
}

// --- Twilio calling back ---------------------------------------------------------------------------

/** The customer's side after Clara: the live transcript starts, then hold music until the colleague joins. */
export async function holdTwiml(itemId: string): Promise<string> {
  const item = await handoverItem(itemId);
  const language = languageOf(item?.handover_language);
  if (item?.handover_status !== "ringing") return `${say(SORRY[language], language)}<Hangup/>`;
  const transcript = xml(await callbackUrl("/api/twilio/handover/transcript", itemId));
  return (
    `<Start><Transcription name="${TRANSCRIPTION}" statusCallbackUrl="${transcript}" track="both_tracks" ` +
    `languageCode="${VOICES[language].language}" partialResults="false" /></Start>` +
    `<Dial><Conference startConferenceOnEnter="false" endConferenceOnExit="true" beep="false">${conferenceName(itemId)}</Conference></Dial>` +
    `<Stop><Transcription name="${TRANSCRIPTION}" /></Stop>` +
    say(GOODBYE[language], language)
  );
}

/** The colleague pressed a key: they join the customer, unless the customer has gone meanwhile. */
export async function colleagueJoins(itemId: string): Promise<string> {
  const joined = await moveOn(itemId, ["ringing"], { handover_status: "live", handover_live_at: new Date().toISOString() });
  if (!joined) return `${say("Sorry, the customer is no longer on the line. Goodbye.")}<Hangup/>`;
  return (
    say("Connecting you now.") +
    `<Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false">${conferenceName(itemId)}</Conference></Dial>` +
    say("The call has ended. Goodbye.")
  );
}

/**
 * One of the two calls ended (Twilio's status callback). The colleague's call ending while the customer
 * still waits means nobody took it. The customer's call ending ends the hand-over, whatever its state.
 */
export async function handoverLegEnded(itemId: string, leg: "customer" | "colleague"): Promise<void> {
  const item = await handoverItem(itemId);
  if (!item?.handover_status) return;
  if (leg === "colleague") {
    // After a talk, the customer's own call ends too (the conference ends with the colleague).
    if (item.handover_status === "ringing") await nobodyTakesIt(item, "missed");
    return;
  }
  await finish(item);
}

/** Nobody took the call: the customer, still on hold, hears that NDI will call back, and the call ends. */
async function nobodyTakesIt(item: HandoverItem, status: "missed" | "failed"): Promise<void> {
  if (!(await moveOn(item.id, ["ringing"], { handover_status: status })) || !item.call_sid) return;
  const language = languageOf(item.handover_language);
  await twilio(`/Calls/${item.call_sid}.json`, { Twiml: twimlDocument(`${say(SORRY[language], language)}<Hangup/>`) }).catch((error) =>
    console.error("hand-over: the customer could not be told", error),
  );
}

/** The customer's call is over: the hand-over ends, the talk is remembered and the list moves on. */
async function finish(item: HandoverItem): Promise<void> {
  const status: HandoverStatus =
    item.handover_status === "ringing" ? "abandoned" : item.handover_status === "live" ? "ended" : (item.handover_status ?? "failed");
  const endedAt = new Date().toISOString();
  const rows = await rest<{ id: string }[]>(`call_list_items?id=eq.${q(item.id)}&handover_ended_at=is.null&select=id`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify({ handover_status: status, handover_ended_at: endedAt }),
  });
  if (!rows.length) return; // finished already: Twilio repeated the callback

  // The customer hung up while waiting: the colleague's phone must not go on ringing.
  if (status === "abandoned" && item.handover_call_sid) {
    await twilio(`/Calls/${item.handover_call_sid}.json`, { Status: "completed" }).catch(() => {});
  }
  if (status === "ended") {
    await rememberTalk({ ...item, handover_ended_at: endedAt }).catch((error) =>
      console.error("hand-over: the talk could not be remembered", error),
    );
  }
  await advance(item.list_id).catch((error) => console.error("call list could not move on", item.list_id, error));
}

const NOTE_SYSTEM = `You write one line for NDI's customer memory about a phone call between a customer and an NDI colleague.
From the transcript, say in at most two short sentences what the customer wanted and what was agreed or promised next.
Plain text. No greeting, no phone numbers or email addresses.`;

/** The talk as one short note: on the call list, and in the customer's memory for every channel. */
async function rememberTalk(item: HandoverItem): Promise<void> {
  const lines = await rest<{ speaker: string; text: string }[]>(
    `handover_lines?item_id=eq.${q(item.id)}&select=speaker,text&order=id.asc&limit=400`,
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

  await rest(`call_list_items?id=eq.${q(item.id)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ handover_note: note.slice(0, 600) }),
  });
  const owner = await findByChannel({ channel: "phone", key: item.phone });
  if (owner) await addCustomerNote(owner.customer.id, "phone", note);
}

/** One finished sentence from Twilio's live transcript, kept while the customer and the colleague talk. */
export async function addTranscriptLine(itemId: string, fields: Record<string, string>): Promise<void> {
  if (fields.TranscriptionEvent !== "transcription-content" || fields.Final !== "true") return;
  let text = "";
  try {
    text = cleanText((JSON.parse(fields.TranscriptionData || "{}") as { transcript?: unknown }).transcript, 1000);
  } catch {
    return;
  }
  if (!text) return;

  // Not the hold music before the colleague joins, nor the message the customer hears when nobody did.
  // "ended" still counts: the last sentence can arrive just after the call.
  const [item] = await rest<{ handover_status: string | null }[]>(`call_list_items?id=eq.${q(itemId)}&select=handover_status&limit=1`);
  if (item?.handover_status !== "live" && item?.handover_status !== "ended") return;

  await rest("handover_lines?on_conflict=ref", {
    method: "POST",
    prefer: "resolution=ignore-duplicates,return=minimal",
    body: JSON.stringify({
      item_id: itemId,
      // On the customer's call, Twilio's inbound track is the customer; the outbound track is what they hear.
      speaker: fields.Track === "inbound_track" ? "customer" : "colleague",
      text,
      ref: fields.TranscriptionSid && fields.SequenceId ? `${fields.TranscriptionSid}:${fields.SequenceId}` : null,
    }),
  });
}

// --- for /admin --------------------------------------------------------------------------------------

export type HandoverLine = { id: number; speaker: "customer" | "colleague"; text: string; created_at: string };

/** What staff see; Twilio's ids and the colleague's number stay on the server. */
const VIEW_FIELDS =
  "id,phone,name,instructions,handover_name,handover_status,handover_summary,handover_language," +
  "handover_started_at,handover_live_at,handover_ended_at,handover_note";

export type HandoverView = {
  item: Pick<
    HandoverItem,
    | "id"
    | "phone"
    | "name"
    | "instructions"
    | "handover_name"
    | "handover_status"
    | "handover_summary"
    | "handover_language"
    | "handover_started_at"
    | "handover_live_at"
    | "handover_ended_at"
    | "handover_note"
  >;
  lines: HandoverLine[];
  /** On the first look only: what NDI already knows about this customer, from every channel. */
  known?: { name: string | null; recent: string[]; interests: string[] } | null;
};

export const handoverActive = (item: Pick<HandoverItem, "handover_status">) =>
  item.handover_status === "ringing" || item.handover_status === "live";

/** The hand-over as it stands, with the lines after `afterId`. Null when this call has none. */
export async function handoverView(itemId: string, afterId: number): Promise<HandoverView | null> {
  const [item] = await rest<HandoverView["item"][]>(`call_list_items?id=eq.${q(itemId)}&select=${VIEW_FIELDS}&limit=1`);
  if (!item?.handover_status) return null;
  const [lines, known] = await Promise.all([
    rest<HandoverLine[]>(
      `handover_lines?item_id=eq.${q(itemId)}&id=gt.${afterId}&select=id,speaker,text,created_at&order=id.asc&limit=200`,
    ),
    afterId > 0 ? undefined : knownAbout(item.phone),
  ]);
  return { item, lines, ...(known === undefined ? {} : { known }) };
}

async function knownAbout(phone: string): Promise<HandoverView["known"]> {
  const owner = await findByChannel({ channel: "phone", key: phone }).catch(() => null);
  if (!owner) return null;
  const profile = await profileFor(owner.customer);
  return { name: profile.name, recent: profile.recent, interests: profile.interests };
}
