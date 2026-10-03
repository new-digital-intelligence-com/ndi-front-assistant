import { holdTwiml } from "@/lib/handover";
import { callFromCallback, twimlResponse } from "@/lib/twilio";

// Twilio asks what the customer hears once Clara has handed them over: they wait on hold until the
// colleague joins, with the live sound and transcript if a staff page shows the call (src/lib/handover.ts).
// The key in the URL is the proof.
export async function POST(request: Request) {
  const call = await callFromCallback(request);
  if (!call) return new Response("Forbidden", { status: 403 });
  try {
    return twimlResponse(await holdTwiml(call));
  } catch (error) {
    console.error("hand-over: hold failed", error);
    return twimlResponse("<Say>I'm sorry, something went wrong. NDI will call you back. Goodbye.</Say><Hangup/>");
  }
}
