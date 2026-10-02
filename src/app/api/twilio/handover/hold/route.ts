import { holdTwiml } from "@/lib/handover";
import { itemFromCallback, twimlResponse } from "@/lib/twilio";

// Twilio asks what the customer hears once Clara has handed them over: the live transcript starts and
// they wait on hold until the colleague joins (src/lib/handover.ts). The key in the URL is the proof.
export async function POST(request: Request) {
  const itemId = await itemFromCallback(request);
  if (!itemId) return new Response("Forbidden", { status: 403 });
  try {
    return twimlResponse(await holdTwiml(itemId));
  } catch (error) {
    console.error("hand-over: hold failed", error);
    return twimlResponse("<Say>I'm sorry, something went wrong. NDI will call you back. Goodbye.</Say><Hangup/>");
  }
}
