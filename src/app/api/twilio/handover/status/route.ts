import { handoverLegEnded } from "@/lib/handover";
import { itemFromCallback, twilioFields } from "@/lib/twilio";

/** A call's last status: Twilio sends only this one unless asked for more. */
const ENDED = ["completed", "busy", "no-answer", "failed", "canceled"];

// Twilio's status callback for the two calls of a hand-over (?leg=customer or ?leg=colleague): when one
// of them ends, the hand-over moves on (src/lib/handover.ts). The key in the URL is the proof.
export async function POST(request: Request) {
  const itemId = await itemFromCallback(request);
  if (!itemId) return new Response("Forbidden", { status: 403 });
  const leg = new URL(request.url).searchParams.get("leg");
  if (leg !== "customer" && leg !== "colleague") return new Response("Unknown call", { status: 400 });

  const fields = await twilioFields(request);
  if (ENDED.includes(fields.CallStatus)) {
    await handoverLegEnded(itemId, leg).catch((error) => console.error("hand-over: call end not handled", leg, error));
  }
  return new Response(null, { status: 204 });
}
