import { colleagueJoins } from "@/lib/handover";
import { callFromCallback, twimlResponse } from "@/lib/twilio";

// The colleague pressed a key after hearing who is waiting: Twilio asks what happens next, and they are
// joined to the customer (src/lib/handover.ts). The key in the URL is the proof.
export async function POST(request: Request) {
  const call = await callFromCallback(request);
  if (!call) return new Response("Forbidden", { status: 403 });
  try {
    return twimlResponse(await colleagueJoins(call));
  } catch (error) {
    console.error("hand-over: the colleague could not join", error);
    return twimlResponse("<Say>Sorry, the call could not be connected. Goodbye.</Say><Hangup/>");
  }
}
