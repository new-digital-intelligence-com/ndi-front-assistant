import { addTranscriptLine } from "@/lib/handover";
import { itemFromCallback, twilioFields } from "@/lib/twilio";

// Twilio's live transcript of a hand-over: one request per finished sentence, from the customer or the
// colleague, which /admin shows with Aida's suggestions (src/lib/handover.ts). The key in the URL is
// the proof.
export async function POST(request: Request) {
  const itemId = await itemFromCallback(request);
  if (!itemId) return new Response("Forbidden", { status: 403 });
  await addTranscriptLine(itemId, await twilioFields(request)).catch((error) =>
    console.error("hand-over: transcript line not stored", error),
  );
  return new Response(null, { status: 204 });
}
