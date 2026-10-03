import { holdTwiml } from "@/lib/handover";
import { callFromCallback, twimlResponse } from "@/lib/twilio";

// Twilio asks what the customer hears once Clara has handed them over: the live transcript and sound start
// and they wait on hold until the colleague joins (src/lib/handover.ts). The key in the URL is the proof.
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
