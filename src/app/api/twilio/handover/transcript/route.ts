import { addTranscriptLine } from "@/lib/handover";
import { callFromCallback, twilioFields } from "@/lib/twilio";

// Twilio's live transcript of a hand-over: one request per finished sentence, from the customer or the
// colleague, which /admin shows with Aida's suggestions (src/lib/handover.ts). The key in the URL is
// the proof.
export async function POST(request: Request) {
  const call = await callFromCallback(request);
  if (!call) return new Response("Forbidden", { status: 403 });
  await addTranscriptLine(call, await twilioFields(request)).catch((error) =>
    console.error("hand-over: transcript line not stored", error),
  );
  return new Response(null, { status: 204 });
}
