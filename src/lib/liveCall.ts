// The live view of a phone call on /admin/calls (src/components/admin/LiveCall.tsx): its sound and a live
// transcript, from Clara's part to the hand-over to a colleague (src/lib/handover.ts). Twilio charges for
// both by the minute (the sound $0.0044, the transcript $0.027), so they run only while a staff page shows
// the call, with one exception: the colleague's talk after a hand-over is always written down, so that it
// can end up in the customer's memory (the user's choice, 3 Oct 2026). ElevenLabs is no longer on the call
// by then, so its summary of the conversation stops where Clara hands over.
//
//   1. A staff member opens a call's live view. Its sound bars connect to the app's WebSocket (server.mjs),
//      which tells this app that the call is now watched (POST /api/live/watch).
//   2. The app asks Twilio, on the running call, for a copy of its audio (to server.mjs, which turns it into
//      sound levels; nobody stores or plays the audio) and, during Clara's part, for a live transcript
//      (each finished sentence arrives at /api/twilio/live/transcript). A call that is still ringing gets
//      both as Clara's conversation starts (customer_lookup, src/lib/incomingCalls.ts).
//   3. A hand-over stops both before the customer's call leaves Clara. The hold music then starts the
//      transcript of the talk in any case (talkTranscriptTwiml), and the sound again if the call is still
//      watched (liveSoundTwiml).
//   4. 15 seconds after the last staff page stopped showing the call, server.mjs tells this app, which
//      stops what it started for the page. The end of the call stops everything anyway.
//
// Each start for a page gets a new name, which Twilio needs to stop it later; it is kept on the call
// (live_name). The talk's transcript has a fixed name of its own (TALK_TRANSCRIPT). The transcript works
// out the language itself (Deepgram's nova-3 "multi": English, German, Italian, French and more).
// server.mjs checks the two keys below with its own copies: keep them in step.

import { stripAudioTags } from "./richText";
import { cleanText } from "./aida";
import { appUrl } from "./appUrl";
import { constantTimeEqual, sha256Hex } from "./auth";
import { findByChannel, profileFor } from "./customers";
import { elevenLabsConversation } from "./elevenlabs";
import { supabaseRest as rest } from "./supabase";
import { callbackUrl, twilio, twilioConfigured, xml, type CallKind, type CallRef } from "./twilio";

const q = encodeURIComponent;

/** Where each kind of call is kept, and how its transcript lines point at it. */
export const CALL_TABLE: Record<CallKind, string> = { list: "call_list_items", incoming: "incoming_calls" };
export const LINE_COLUMN: Record<CallKind, string> = { list: "item_id", incoming: "incoming_id" };
export const callPath = (ref: CallRef) => `${CALL_TABLE[ref.kind]}?id=eq.${q(ref.id)}`;

/** Where Twilio sends the audio (server.mjs). Staff pages watch on /api/live/signal. */
export const MEDIA_STREAM_PATH = "/api/twilio/media-stream";
const TRANSCRIPT_PATH = "/api/twilio/live/transcript";

/** Proves to server.mjs that a copy of the audio was asked for by this app, for this call. */
export async function signalKey(ref: CallRef): Promise<string> {
  return (await sha256Hex(`ndi-live:${process.env.TWILIO_AUTH_TOKEN?.trim() ?? ""}:${ref.kind}:${ref.id}`)).slice(0, 32);
}

/** Proves to /api/live/watch that server.mjs is asking (header x-ndi-live). */
export async function isWatchRequest(request: Request): Promise<boolean> {
  const key = request.headers.get("x-ndi-live") ?? "";
  if (!twilioConfigured() || !key) return false;
  return constantTimeEqual(await sha256Hex(`ndi-live-watch:${process.env.TWILIO_AUTH_TOKEN?.trim() ?? ""}`), key);
}

function streamUrl(): string | null {
  const base = appUrl();
  return base ? `${base.replace(/^http/, "ws")}${MEDIA_STREAM_PATH}` : null;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 200);

// --- the call as the live view needs it ------------------------------------------------------------

type LiveState = {
  call_sid: string | null;
  status: string;
  live_on: boolean;
  live_name: string | null;
  handover_status: string | null;
};

/** A call-list call is on while it is "calling" (ringing, with Clara, or handed over); a call to NDI while "live". */
const callIsOn = (ref: CallRef, status: string | null | undefined) => status === (ref.kind === "list" ? "calling" : "live");

async function liveState(ref: CallRef): Promise<LiveState | null> {
  const [row] = await rest<LiveState[]>(`${callPath(ref)}&select=call_sid,status,live_on,live_name,handover_status&limit=1`);
  return row ?? null;
}

/**
 * Takes the name for a new sound copy (and transcript), if `from` is still the call's current one (null:
 * none). Two requests can never start two of them: Twilio allows four audio copies per call, and a sound
 * copy and a transcript of both voices use two each.
 */
async function claimName(ref: CallRef, from: string | null): Promise<string | null> {
  const name = `ndi-live-${crypto.randomUUID().slice(0, 8)}`;
  const current = from ? `eq.${q(from)}` : "is.null";
  const claimed = await rest<{ id: string }[]>(`${callPath(ref)}&live_name=${current}&select=id`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify({ live_name: name, live_signal: null }),
  });
  return claimed.length ? name : null;
}

/** Twilio's live transcript: every finished sentence of both voices, in whichever language is spoken. */
const TRANSCRIPT = { engine: "deepgram", model: "nova-3", language: "multi" };

/** The colleague's talk after a hand-over: a fixed name, so the hold TwiML can stop it before the goodbye. */
const TALK_TRANSCRIPT = "handover";

async function streamParameters(ref: CallRef): Promise<[string, string][]> {
  return [
    ["kind", ref.kind],
    ["id", ref.id],
    ["key", await signalKey(ref)],
  ];
}

// --- starting and stopping ----------------------------------------------------------------------------

/** Starts the sound, and the transcript if asked, on a running call. What went wrong with each, or null. */
async function startOnCall(
  ref: CallRef,
  callSid: string,
  name: string,
  withTranscript: boolean,
): Promise<{ sound: string | null; transcript: string | null }> {
  const url = streamUrl();
  const sid = q(callSid);
  const parameters = (await streamParameters(ref)).flatMap(([key, value], index): [string, string][] => [
    [`Parameter${index + 1}.Name`, key],
    [`Parameter${index + 1}.Value`, value],
  ]);
  const [sound, transcript] = await Promise.all([
    url
      ? twilio(`/Calls/${sid}/Streams.json`, { Url: url, Track: "both_tracks", Name: name, ...Object.fromEntries(parameters) }).then(
          () => null,
          errorText,
        )
      : "APP_URL is not set",
    withTranscript
      ? twilio(`/Calls/${sid}/Transcriptions.json`, {
          Name: name,
          Track: "both_tracks",
          StatusCallbackUrl: await callbackUrl(TRANSCRIPT_PATH, ref),
          TranscriptionEngine: TRANSCRIPT.engine,
          SpeechModel: TRANSCRIPT.model,
          LanguageCode: TRANSCRIPT.language,
          PartialResults: "false",
        }).then(() => null, errorText)
      : null,
  ]);
  if (sound || transcript) console.error("live call: Twilio refused", ref, { sound, transcript });
  return { sound, transcript };
}

/**
 * Stops the sound and the transcript of that name. Either may be over already, or may never have run
 * (after a hand-over only the sound starts): that is fine.
 */
async function stopOnCall(callSid: string, name: string): Promise<void> {
  const sid = q(callSid);
  await Promise.all([
    twilio(`/Calls/${sid}/Streams/${q(name)}.json`, { Status: "stopped" }).catch(() => {}),
    twilio(`/Calls/${sid}/Transcriptions/${q(name)}.json`, { Status: "stopped" }).catch(() => {}),
  ]);
}

/**
 * Starts the sound and the transcript of a call a staff page shows, unless they run already; `restart`
 * replaces any that may be left over (after a restart of the app, a copy has nowhere to go). Only on a
 * call in progress: one still ringing gets them as Clara's conversation starts. After a hand-over only the
 * sound: the talk is written down anyway (talkTranscriptTwiml). Never throws.
 */
export async function ensureLive(ref: CallRef, restart = false): Promise<void> {
  if (!twilioConfigured()) return;
  try {
    const state = await liveState(ref);
    if (!state?.live_on || !state.call_sid || !callIsOn(ref, state.status)) return;
    if (state.live_name && !restart) return;
    const call = await twilio<{ status?: string }>(`/Calls/${q(state.call_sid)}.json`);
    if (call.status !== "in-progress") return;

    const name = await claimName(ref, state.live_name);
    if (!name) return;
    if (state.live_name) await stopOnCall(state.call_sid, state.live_name);
    const withTranscript = !state.handover_status;
    const { sound, transcript } = await startOnCall(ref, state.call_sid, name, withTranscript);
    if (!sound && !transcript) return;
    const problem = [sound && `Sound: ${sound}`, transcript && `Transcript: ${transcript}`].filter(Boolean).join(" · ");
    // Nothing runs when all that was asked for failed: the name goes, so the next look can try again.
    const nothing = Boolean(sound) && (Boolean(transcript) || !withTranscript);
    await rest(`${callPath(ref)}&live_name=eq.${q(name)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ live_signal: problem.slice(0, 300), ...(nothing ? { live_name: null } : {}) }),
    });
  } catch (error) {
    console.error("live call could not start", ref, error);
  }
}

/** Stops the sound and the transcript started for staff pages, if they run; never the talk's. Never throws. */
export async function stopLive(ref: CallRef): Promise<void> {
  if (!twilioConfigured()) return;
  try {
    const state = await liveState(ref);
    if (!state?.live_name) return;
    const cleared = await rest<{ id: string }[]>(`${callPath(ref)}&live_name=eq.${q(state.live_name)}&select=id`, {
      method: "PATCH",
      prefer: "return=representation",
      body: JSON.stringify({ live_name: null }),
    });
    if (cleared.length && state.call_sid) await stopOnCall(state.call_sid, state.live_name);
  } catch (error) {
    console.error("live call could not stop", ref, error);
  }
}

/**
 * The sound as TwiML, for the customer's call on hold at a hand-over, if a staff page shows it. The
 * hand-over stopped it before the call left Clara (stopLive), so it starts again here.
 */
export async function liveSoundTwiml(ref: CallRef): Promise<string> {
  const url = streamUrl();
  if (!twilioConfigured() || !url) return "";
  const state = await liveState(ref).catch(() => null);
  if (!state?.live_on || state.live_name) return "";
  const name = await claimName(ref, null).catch(() => null);
  if (!name) return "";
  const parameters = (await streamParameters(ref)).map(([key, value]) => `<Parameter name="${key}" value="${xml(value)}"/>`).join("");
  return `<Start><Stream name="${name}" url="${xml(url)}" track="both_tracks">${parameters}</Stream></Start>`;
}

/**
 * The talk after a hand-over, written down in any case, for the customer's memory (the user's choice,
 * 3 Oct 2026): `start` goes before the hold music and `stop` after the conference, so the goodbye the
 * customer hears is not part of it. Lines count from when the colleague joins (addTranscriptLine).
 */
export async function talkTranscriptTwiml(ref: CallRef): Promise<{ start: string; stop: string }> {
  return {
    start:
      `<Start><Transcription name="${TALK_TRANSCRIPT}" statusCallbackUrl="${xml(await callbackUrl(TRANSCRIPT_PATH, ref))}" ` +
      `track="both_tracks" transcriptionEngine="${TRANSCRIPT.engine}" speechModel="${TRANSCRIPT.model}" ` +
      `languageCode="${TRANSCRIPT.language}" partialResults="false" /></Start>`,
    stop: `<Stop><Transcription name="${TALK_TRANSCRIPT}" /></Stop>`,
  };
}

// --- who is watching (server.mjs, through /api/live/watch) -------------------------------------------

/** A staff page now shows this call. */
export async function watchStarted(ref: CallRef): Promise<void> {
  await rest(callPath(ref), { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ live_on: true }) });
  await ensureLive(ref, true);
}

/** No staff page has shown this call for a while. */
export async function watchEnded(ref: CallRef): Promise<void> {
  await rest(callPath(ref), { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ live_on: false }) });
  await stopLive(ref);
}

/** server.mjs has just started: no page watches anything yet, so nothing left over keeps running. */
export async function resetLive(): Promise<void> {
  for (const kind of ["list", "incoming"] as const) {
    const rows = await rest<{ id: string }[]>(`${CALL_TABLE[kind]}?or=(live_on.is.true,live_name.not.is.null)&select=id`);
    for (const { id } of rows) await watchEnded({ kind, id });
  }
}

// --- the transcript --------------------------------------------------------------------------------

/**
 * One request from Twilio's live transcript: a finished sentence from the customer, from Clara, or from
 * the colleague after a hand-over. The customer is the inbound track of their own call; the outbound track
 * is what they hear. Not the hold music before the colleague joins, nor the message the customer hears
 * when nobody did.
 */
export async function addTranscriptLine(ref: CallRef, fields: Record<string, string>): Promise<void> {
  if (fields.TranscriptionEvent === "transcription-error") {
    const why = cleanText(fields.TranscriptionError, 200) || `error ${fields.TranscriptionErrorCode ?? "unknown"}`;
    console.error("live call: the transcript stopped", ref, why);
    await rest(callPath(ref), { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ live_signal: `Transcript: ${why}` }) });
    return;
  }
  if (fields.TranscriptionEvent !== "transcription-content" || fields.Final !== "true") return;
  let text = "";
  try {
    text = cleanText((JSON.parse(fields.TranscriptionData || "{}") as { transcript?: unknown }).transcript, 1000);
  } catch {
    return;
  }
  if (!text) return;

  // "ended" still counts: the last sentence of the talk can arrive just after the call.
  const [call] = await rest<{ handover_status: string | null }[]>(`${callPath(ref)}&select=handover_status&limit=1`);
  if (!call) return;
  const ndi = !call.handover_status ? "clara" : call.handover_status === "live" || call.handover_status === "ended" ? "colleague" : null;
  if (!ndi) return;

  await rest("handover_lines?on_conflict=ref", {
    method: "POST",
    prefer: "resolution=ignore-duplicates,return=minimal",
    body: JSON.stringify({
      [LINE_COLUMN[ref.kind]]: ref.id,
      speaker: fields.Track === "inbound_track" ? "customer" : ndi,
      text,
      ref: fields.TranscriptionSid && fields.SequenceId ? `${fields.TranscriptionSid}:${fields.SequenceId}` : null,
    }),
  });
}

// --- for /admin --------------------------------------------------------------------------------------

export type LiveLine = { id: number; speaker: "customer" | "clara" | "colleague"; text: string; created_at: string };

/** What staff see; Twilio's ids and the colleague's number stay on the server. */
const SHARED_FIELDS =
  "id,phone,name,instructions,status,started_at,summary,live_signal,handover_name,handover_status,handover_summary," +
  "handover_started_at,handover_live_at,handover_ended_at,handover_note";
const VIEW_FIELDS: Record<CallKind, string> = { list: `${SHARED_FIELDS},ended_at:finished_at`, incoming: `${SHARED_FIELDS},ended_at` };

export type LiveCall = {
  id: string;
  phone: string | null;
  name: string | null;
  instructions: string;
  /** Whether the call is still going: Clara, the hold music or the colleague. */
  on: boolean;
  started_at: string | null;
  ended_at: string | null;
  /** ElevenLabs' summary of Clara's part, once it is over. */
  summary: string | null;
  /** What Twilio refused when the sound or the transcript should have started. */
  live_signal: string | null;
  handover_name: string | null;
  handover_status: "ringing" | "live" | "ended" | "missed" | "abandoned" | "failed" | null;
  handover_summary: string | null;
  handover_started_at: string | null;
  handover_live_at: string | null;
  handover_ended_at: string | null;
  handover_note: string | null;
};

export type LiveCallView = {
  kind: CallKind;
  call: LiveCall;
  lines: LiveLine[];
  /** On the first look only: what NDI already knows about this customer, from every channel. */
  known?: { name: string | null; recent: string[]; interests: string[] } | null;
};

/** The call as it stands, with the transcript lines after `afterId`. Null when there is no such call. */
export async function liveCallView(ref: CallRef, afterId: number): Promise<LiveCallView | null> {
  const [row] = await rest<(Omit<LiveCall, "on"> & { status: string })[]>(`${callPath(ref)}&select=${VIEW_FIELDS[ref.kind]}&limit=1`);
  if (!row) return null;
  const [lines, known] = await Promise.all([
    rest<LiveLine[]>(
      `handover_lines?${LINE_COLUMN[ref.kind]}=eq.${q(ref.id)}&id=gt.${afterId}&select=id,speaker,text,created_at&order=id.asc&limit=200`,
    ),
    afterId > 0 ? undefined : knownAbout(row.phone),
  ]);
  const { status, ...call } = row;
  return { kind: ref.kind, call: { ...call, on: callIsOn(ref, status) }, lines, ...(known === undefined ? {} : { known }) };
}

export type ClaraLine = { speaker: "customer" | "clara"; text: string };

/**
 * Clara's part of a call in full, as ElevenLabs keeps it: every turn she and the customer took, until the call
 * ended or she handed it over (the user's request, 4 Oct 2026). Free to read, and exact, unlike a live
 * transcript of the audio. "pending" until ElevenLabs has finished with the conversation (a few seconds to a
 * minute after Clara's part); "none" when there is nothing to show.
 */
export async function claraTranscript(ref: CallRef): Promise<{ state: "done" | "pending" | "none"; lines: ClaraLine[] }> {
  const [row] = await rest<{ conversation_id: string | null }[]>(`${callPath(ref)}&select=conversation_id&limit=1`);
  if (!row?.conversation_id) return { state: "none", lines: [] };
  // Not found: ElevenLabs creates the record a moment after the call starts.
  const record = await elevenLabsConversation(row.conversation_id).catch(() => null);
  if (!record || (record.status !== "done" && record.status !== "failed")) return { state: "pending", lines: [] };
  const lines = (record.transcript ?? [])
    .map((turn): ClaraLine =>
      turn.role === "user"
        ? { speaker: "customer", text: cleanText(turn.message, 2000) }
        : // Without the audio tags her voice model writes ([calm]).
          { speaker: "clara", text: stripAudioTags(cleanText(turn.message, 2000)) },
    )
    // Clara's tool calls and their results are turns without words.
    .filter((line) => line.text);
  return { state: lines.length ? "done" : "none", lines };
}

async function knownAbout(phone: string | null): Promise<LiveCallView["known"]> {
  if (!phone) return null;
  const owner = await findByChannel({ channel: "phone", key: phone }).catch(() => null);
  if (!owner) return null;
  const profile = await profileFor(owner.customer);
  return { name: profile.name, recent: profile.recent, interests: profile.interests };
}
