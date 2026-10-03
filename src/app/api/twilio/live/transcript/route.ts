import { addTranscriptLine } from "@/lib/liveCall";
import { callFromCallback, twilioFields } from "@/lib/twilio";

// Twilio's live transcript of a call that a staff page shows live: one request per finished sentence, from
// the customer, Clara or, after a hand-over, the colleague (src/lib/liveCall.ts). The key in the URL is
// the proof.
export async function POST(request: Request) {
  const call = await callFromCallback(request);
  if (!call) return new Response("Forbidden", { status: 403 });
  await addTranscriptLine(call, await twilioFields(request)).catch((error) =>
    console.error("live call: transcript line not stored", error),
  );
  return new Response(null, { status: 204 });
}
