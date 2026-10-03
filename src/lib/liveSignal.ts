// The live sound of a phone call on /admin/calls (src/components/admin/LiveSignal.tsx). Twilio sends a copy
// of the call's audio, both directions, to the app's WebSocket (server.mjs), which turns it into sound
// levels ten times a second for the staff watching. Nobody stores or plays the audio. Twilio charges
// $0.0044 a minute for the copy.
//
// The copy starts as Clara's conversation starts (customer_lookup), through Twilio's REST API on the running
// call, and again when the call is handed over to a colleague (the hold TwiML), in case Twilio ended the
// first one when the call left Clara. The WebSocket server follows the newest copy of a call.
//
// server.mjs checks the key below with its own copy of signalKey: keep the two in step.

import { appUrl } from "./appUrl";
import { sha256Hex } from "./auth";
import { twilio, twilioConfigured, xml, type CallRef } from "./twilio";

/** Where Twilio sends the audio (server.mjs). Staff browsers watch on /api/live/signal. */
export const MEDIA_STREAM_PATH = "/api/twilio/media-stream";

/** Proves to server.mjs that a copy of the audio was asked for by this app, for this call. */
export async function signalKey(ref: CallRef): Promise<string> {
  return (await sha256Hex(`ndi-live:${process.env.TWILIO_AUTH_TOKEN?.trim() ?? ""}:${ref.kind}:${ref.id}`)).slice(0, 32);
}

function streamUrl(): string | null {
  const base = appUrl();
  return base ? `${base.replace(/^http/, "ws")}${MEDIA_STREAM_PATH}` : null;
}

/**
 * Starts the copy on a call that is already running. Never throws: the call matters more than its
 * picture. Returns why the copy could not start, or null when it did.
 */
export async function startLiveSignal(callSid: string, ref: CallRef): Promise<string | null> {
  const url = streamUrl();
  if (!twilioConfigured() || !url) return "Twilio or APP_URL is not set up";
  try {
    await twilio(`/Calls/${encodeURIComponent(callSid)}/Streams.json`, {
      Url: url,
      Track: "both_tracks",
      Name: "ndi-live",
      "Parameter1.Name": "kind",
      "Parameter1.Value": ref.kind,
      "Parameter2.Name": "id",
      "Parameter2.Value": ref.id,
      "Parameter3.Name": "key",
      "Parameter3.Value": await signalKey(ref),
    });
    return null;
  } catch (error) {
    console.error("live sound could not start", ref, error);
    return (error instanceof Error ? error.message : "the live sound could not start").slice(0, 300);
  }
}

/** The same copy as TwiML, for the customer's call once it has left Clara for the hand-over. */
export async function liveSignalTwiml(ref: CallRef): Promise<string> {
  const url = streamUrl();
  if (!twilioConfigured() || !url) return "";
  const parameter = (name: string, value: string) => `<Parameter name="${name}" value="${xml(value)}"/>`;
  return (
    `<Start><Stream name="ndi-live-handover" url="${xml(url)}" track="both_tracks">` +
    parameter("kind", ref.kind) +
    parameter("id", ref.id) +
    parameter("key", await signalKey(ref)) +
    `</Stream></Start>`
  );
}
